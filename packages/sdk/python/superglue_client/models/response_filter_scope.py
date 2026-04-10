from enum import Enum


class ResponseFilterScope(str, Enum):
    ENTRY = "ENTRY"
    FIELD = "FIELD"
    ITEM = "ITEM"

    def __str__(self) -> str:
        return str(self.value)
