from enum import Enum


class ListRunsStatus(str, Enum):
    ABORTED = "aborted"
    FAILED = "failed"
    RUNNING = "running"
    SUCCESS = "success"

    def __str__(self) -> str:
        return str(self.value)
