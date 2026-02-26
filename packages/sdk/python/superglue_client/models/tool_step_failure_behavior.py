from enum import Enum


class ToolStepFailureBehavior(str, Enum):
    CONTINUE = "continue"
    FAIL = "fail"

    def __str__(self) -> str:
        return str(self.value)
