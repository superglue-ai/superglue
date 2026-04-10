from enum import Enum


class ResponseFilterTarget(str, Enum):
    BOTH = "BOTH"
    KEYS = "KEYS"
    VALUES = "VALUES"

    def __str__(self) -> str:
        return str(self.value)
