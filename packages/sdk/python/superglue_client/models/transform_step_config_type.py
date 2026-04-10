from enum import Enum


class TransformStepConfigType(str, Enum):
    TRANSFORM = "transform"

    def __str__(self) -> str:
        return str(self.value)
