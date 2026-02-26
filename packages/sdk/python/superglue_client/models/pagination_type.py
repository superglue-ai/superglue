from enum import Enum


class PaginationType(str, Enum):
    CURSORBASED = "cursorBased"
    DISABLED = "disabled"
    OFFSETBASED = "offsetBased"
    PAGEBASED = "pageBased"

    def __str__(self) -> str:
        return str(self.value)
