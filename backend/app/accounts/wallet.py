"""Общий интерфейс «монеты» (#5): студийный кошелёк (coins.py) и кошелёк платформы Mentorium.

Конвейеры картинок и экраны баланса работают только через `wallet_for(child)`. Журнал один —
CoinLedger; ref_id gen:/refund: уникальны для обоих кошельков, поэтому двойное списание и двойной
возврат невозможны. Возврат в два шага, чтобы платформу не звать при открытой записи в SQLite:
`refund_prepare` (запись, без сети) -> commit вызывающего -> `refund_settle` (сеть).
"""

from typing import Protocol

from sqlalchemy.orm import Session

from app.accounts import coins
from app.accounts.models import Child


class WalletUnavailable(Exception):
    """Баланс прочитать нельзя (платформа не отвечает/не настроена)."""


class Wallet(Protocol):
    def balance(self, db: Session, child: Child) -> int: ...

    def charge(self, db: Session, child: Child, amount: int, reason: str, ref_id: str) -> str:
        """'ok' | 'no_coins' | 'duplicate' | 'unavailable' | 'uncertain' (последние два — только платформа)."""
        ...

    def refund_prepare(
        self, db: Session, child: Child, amount: int, charge_ref: str, refund_ref: str
    ) -> bool: ...

    def refund_settle(self, db: Session, child: Child, refund_ref: str) -> str | None: ...


class StudioWallet:
    def balance(self, db: Session, child: Child) -> int:
        return coins.balance(db, child.id)

    def charge(self, db: Session, child: Child, amount: int, reason: str, ref_id: str) -> str:
        return coins.charge(db, child.id, amount, reason, ref_id)

    def refund_prepare(
        self, db: Session, child: Child, amount: int, charge_ref: str, refund_ref: str
    ) -> bool:
        """Возвращаем, только если списывали; повтор с тем же refund_ref ничего не делает."""
        if coins.has_entry(db, charge_ref):
            return coins.add_entry(db, child.id, amount, "refund", refund_ref)
        return False

    def refund_settle(self, db: Session, child: Child, refund_ref: str) -> str | None:
        return None  # студийный возврат уже записан в той же транзакции


def wallet_for(child: Child) -> Wallet:
    if child.platform_user_id:
        from app.platform.wallet import PlatformWallet

        return PlatformWallet()
    return StudioWallet()


def balance_of(db: Session, child: Child) -> int:
    """Баланс ребёнка; WalletUnavailable, если платформа не отвечает."""
    from app.platform.client import PlatformError

    try:
        return wallet_for(child).balance(db, child)
    except PlatformError:
        raise WalletUnavailable from None


def recover_platform(db: Session) -> int:
    from app.platform.wallet import recover

    return recover(db)
