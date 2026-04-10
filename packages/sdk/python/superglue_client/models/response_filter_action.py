from enum import Enum


class ResponseFilterAction(str, Enum):
    FAIL = "FAIL"
    MASK = "MASK"
    REMOVE = "REMOVE"

    def __str__(self) -> str:
        return str(self.value)
