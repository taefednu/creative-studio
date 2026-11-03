"""Кошелёк ребёнка Mentorium: баланс и списание на платформе, журнал — наш CoinLedger (#5).

Порядок списания (adjust не проверяет минус и не идемпотентен):
  1. читаем баланс; нет монет -> no_coins, adjust не зовём;
  2. пишем намерение (status=pending, ref_id уникален) и коммитим;
  3. зовём adjust БЕЗ открытой транзакции SQLite (иначе блокировка валит запись всему классу);
  4. успех -> done; 4xx или отказ соединения -> failed (монет не тронуто); таймаут, обрыв, 5xx, расхождение
     баланса с ожидаемым -> uncertain (платформа делает commit до ответа).
uncertain не повторяем и не возвращаем автоматически: иначе можно начислить лишнее (принятый риск).
"""

import logging
import threading

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.accounts import coins
from app.accounts.models import Child, CoinLedger
from app.platform import client as pc

log = logging.getLogger("app.platform")

STUDIO = "studio:"  # запись журнала, оплаченная остатком студийных монет
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock(uid: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(uid, threading.Lock())


def _reason(ref_id: str) -> str:
    return f"Mentorium Creative Studio: {ref_id}"


def _mark(db: Session, ref_id: str, status: str, zero: bool = False) -> None:
    vals: dict = {"status": status}
    if zero:  # платформа ничего не списала: запись остаётся как след, но на суммы не влияет
        vals["delta"] = 0
    db.execute(update(CoinLedger).where(CoinLedger.ref_id == ref_id).values(**vals))
    db.commit()


class PlatformWallet:
    def balance(self, db: Session, child: Child) -> int:
        """pc.Unavailable / pc.NotConfigured — платформа недоступна."""
        assert child.platform_user_id
        return pc.get_client().balance(child.platform_user_id) + child.studio_coins

    def _charge_studio(self, db: Session, child: Child, amount: int, reason: str, ref_id: str) -> str | None:
        """Сначала остаток студийных монет с привязки: они не пропадают и на платформу не уходят.

        ponytail: цена не делится между кошельками; 2 студийные и 1 платформы на цену 3 дадут no_coins.
        """
        spent = db.execute(
            update(Child).where(Child.id == child.id, Child.studio_coins >= amount).values(studio_coins=Child.studio_coins - amount)
        )
        if spent.rowcount != 1:
            return None
        if not coins.add_entry(db, child.id, -amount, STUDIO + reason, ref_id):
            db.rollback()
            return "duplicate"
        db.commit()
        db.refresh(child)
        return "ok"

    def charge(self, db: Session, child: Child, amount: int, reason: str, ref_id: str) -> str:
        """'ok' | 'no_coins' | 'duplicate' | 'unavailable' | 'uncertain'."""
        uid = child.platform_user_id
        assert uid
        db.commit()  # к платформе идём без открытой транзакции
        if coins.has_entry(db, ref_id):
            return "duplicate"
        done = self._charge_studio(db, child, amount, reason, ref_id)
        if done:
            return done
        with _lock(uid):  # два параллельных списания одного ребёнка не читают один и тот же баланс
            try:
                client = pc.get_client()
                bal = client.balance(uid)
                if bal < amount:
                    return "no_coins"
            except pc.PlatformError:
                return "unavailable"
            if not coins.add_entry(db, child.id, -amount, reason, ref_id, status="pending"):
                db.rollback()
                return "duplicate"
            db.commit()
            try:
                new = client.adjust(uid, -amount, _reason(ref_id))
                if new != bal - amount:
                    # платформа обрезает баланс до 0 и мог измениться за это время: не знаем, что списано
                    raise pc.Uncertain("balance_mismatch")
            except pc.Uncertain:
                log.warning("platform charge uncertain: ref=%s", ref_id)
                _mark(db, ref_id, "uncertain")
                return "uncertain"
            except pc.PlatformError:
                _mark(db, ref_id, "failed", zero=True)
                return "unavailable"
            _mark(db, ref_id, "done")
            return "ok"

    def refund_prepare(
        self, db: Session, child: Child, amount: int, charge_ref: str, refund_ref: str
    ) -> bool:
        """Запись о возврате, без сети и без commit. Только если списание подтверждено (done)."""
        row = db.execute(select(CoinLedger.status, CoinLedger.reason).where(CoinLedger.ref_id == charge_ref)).first()
        if row is None or row.status != "done":
            return False
        if row.reason.startswith(STUDIO):
            # status done: refund_settle берёт только pending, на платформу такой возврат не уйдёт
            if not coins.add_entry(db, child.id, amount, "refund", refund_ref):
                return False
            db.execute(update(Child).where(Child.id == child.id).values(studio_coins=Child.studio_coins + amount))
            return True
        return coins.add_entry(db, child.id, amount, "refund", refund_ref, status="pending")

    def refund_settle(self, db: Session, child: Child, refund_ref: str) -> str:
        """Зовёт adjust с плюсом ровно для одной записи; вызывать после commit."""
        db.commit()
        uid = child.platform_user_id
        assert uid
        claimed = db.execute(
            update(CoinLedger)
            .where(
                CoinLedger.ref_id == refund_ref,
                CoinLedger.status.in_(("pending", "refund_pending")),
            )
            .values(status="sending")
        )
        db.commit()
        if claimed.rowcount != 1:
            return "skip"  # уже возвращено или кто-то возвращает
        amount = db.scalar(select(CoinLedger.delta).where(CoinLedger.ref_id == refund_ref)) or 0
        try:
            pc.get_client().adjust(uid, amount, _reason(refund_ref))
        except pc.Uncertain:
            log.warning("platform refund uncertain: ref=%s", refund_ref)
            _mark(db, refund_ref, "uncertain")
            return "uncertain"
        except pc.PlatformError:
            log.warning("platform refund failed, retry on start: ref=%s", refund_ref)
            _mark(db, refund_ref, "refund_pending")
            return "unavailable"
        _mark(db, refund_ref, "done")
        return "done"


def recover(db: Session) -> int:
    """При старте: зависшие намерения -> uncertain; недошедшие возвраты повторяем (по одному разу)."""
    stuck = db.execute(
        update(CoinLedger)
        .where(CoinLedger.status.in_(("pending", "sending")), CoinLedger.reason != "refund")
        .values(status="uncertain")
    )
    stuck2 = db.execute(
        update(CoinLedger)
        .where(CoinLedger.status == "sending", CoinLedger.reason == "refund")
        .values(status="uncertain")
    )
    db.commit()
    rows = db.execute(
        select(CoinLedger.ref_id, CoinLedger.child_id).where(
            CoinLedger.reason == "refund", CoinLedger.status.in_(("pending", "refund_pending"))
        )
    ).all()
    n = 0
    for ref, child_id in rows:
        child = db.get(Child, child_id)
        if child is not None and child.platform_user_id and ref:
            n += 1
            try:
                outcome = PlatformWallet().refund_settle(db, child, ref)
            except Exception:  # noqa: BLE001 — старт не падает из-за возврата
                log.warning("refund recover failed: ref=%s", ref)
                db.rollback()
                continue
            if outcome == "unavailable":
                break  # платформа лежит: остальные не мучаем, повторим на следующем старте
    return n + (stuck.rowcount or 0) + (stuck2.rowcount or 0)
