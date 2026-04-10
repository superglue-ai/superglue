from enum import Enum


class RequestStepConfigType(str, Enum):
    REQUEST = "request"

    def __str__(self) -> str:
        return str(self.value)
