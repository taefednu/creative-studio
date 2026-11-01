from sqlalchemy import DateTime, bindparam, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import clock
from app.accounts.models import CoinLedger
from app.config import get_settings


def balance(db: Session, child_id: int) -> int:
    q = select(func.coalesce(func.sum(CoinLedger.delta), 0)).where(CoinLedger.child_id == child_id)
    return int(db.scalar(q) or 0)


def add_entry(
    db: Session, child_id: int, delta: int, reason: str, ref_id: str | None, status: str = "done"
) -> bool:
    """False — запись с таким ref_id уже есть (идемпотентность)."""
    try:
        with db.begin_nested():
            db.add(
                CoinLedger(
                    child_id=child_id, delta=delta, reason=reason, ref_id=ref_id, status=status
                )
            )
            db.flush()
    except IntegrityError:
        return False
    return True


def grant_daily(db: Session, child_id: int) -> None:
    """+COIN_DAILY раз в сутки, баланс не выше COIN_CAP. День помечаем всегда, даже при нуле."""
    s = get_settings()
    ref = f"daily:{child_id}:{clock.today().isoformat()}"
    if db.scalar(select(CoinLedger.id).where(CoinLedger.ref_id == ref)):
        return
    amount = max(0, min(s.COIN_DAILY, s.COIN_CAP - balance(db, child_id)))
    add_entry(db, child_id, amount, "daily", ref)
    db.commit()


def has_entry(db: Session, ref_id: str) -> bool:
    return db.scalar(select(CoinLedger.id).where(CoinLedger.ref_id == ref_id)) is not None


_CHARGE = text(
    "INSERT INTO coin_ledger (child_id, delta, reason, ref_id, created_at) "
    "SELECT :c, :d, :r, :ref, :now "
    "WHERE (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger WHERE child_id = :c) >= :amt"
).bindparams(bindparam("now", type_=DateTime))


def charge(db: Session, child_id: int, amount: int, reason: str, ref_id: str) -> str:
    """Списание без ухода в минус: проверка баланса и вставка — один оператор SQL.

    'ok' | 'no_coins' | 'duplicate' (запись с таким ref_id уже есть).
    """
    params = {"c": child_id, "d": -amount, "r": reason, "ref": ref_id, "now": clock.now(), "amt": amount}
    try:
        with db.begin_nested():
            res = db.execute(_CHARGE, params)
    except IntegrityError:
        return "duplicate"
    return "ok" if res.rowcount == 1 else "no_coins"
