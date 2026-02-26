from enum import Enum


class RunStatus(str, Enum):
    ABORTED = "aborted"
    FAILED = "failed"
    RUNNING = "running"
    SUCCESS = "success"

    def __str__(self) -> str:
        return str(self.value)
