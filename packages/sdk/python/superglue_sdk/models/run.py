from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.run_status import RunStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.run_data import RunData
    from ..models.run_metadata import RunMetadata
    from ..models.run_options import RunOptions
    from ..models.run_step_results_item import RunStepResultsItem
    from ..models.run_tool import RunTool
    from ..models.run_tool_payload import RunToolPayload


T = TypeVar("T", bound="Run")


@_attrs_define
class Run:
    """
    Attributes:
        run_id (str): Unique identifier for this run (maps to 'id' in GraphQL schema) Example:
            7f3e9c1a-2b4d-4e8f-9a3b-1c5d7e9f2a4b.
        tool_id (str): ID of the tool that was executed Example: 550e8400-e29b-41d4-a716-446655440000.
        status (RunStatus): Execution status:
            - running: Execution in progress
            - success: Completed successfully
            - failed: Failed due to error
            - aborted: Cancelled by user or system
             Example: success.
        metadata (RunMetadata):
        tool (RunTool | Unset): Tool metadata (not full configuration, maps to 'toolConfig' in GraphQL)
        tool_payload (RunToolPayload | Unset): The inputs and options provided when running the tool (maps to
            'toolPayload' in GraphQL)
        data (RunData | Unset): Tool execution results (only present when status is success, maps to 'toolResult' in
            GraphQL)
        error (str | Unset): Error message (only present when status is failed or aborted) Example: Connection timeout
            after 30 seconds.
        step_results (list[RunStepResultsItem] | Unset): Results from each execution step (only for multi-step tools)
        options (RunOptions | Unset): Execution options that were used for this run
        request_source (str | Unset): Source identifier for where the run was initiated Example: api.
        trace_id (str | Unset): Trace ID for this run (for debugging and log correlation) Example:
            a1b2c3d4-e5f6-7890-abcd-ef1234567890.
    """

    run_id: str
    tool_id: str
    status: RunStatus
    metadata: RunMetadata
    tool: RunTool | Unset = UNSET
    tool_payload: RunToolPayload | Unset = UNSET
    data: RunData | Unset = UNSET
    error: str | Unset = UNSET
    step_results: list[RunStepResultsItem] | Unset = UNSET
    options: RunOptions | Unset = UNSET
    request_source: str | Unset = UNSET
    trace_id: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        run_id = self.run_id

        tool_id = self.tool_id

        status = self.status.value

        metadata = self.metadata.to_dict()

        tool: dict[str, Any] | Unset = UNSET
        if not isinstance(self.tool, Unset):
            tool = self.tool.to_dict()

        tool_payload: dict[str, Any] | Unset = UNSET
        if not isinstance(self.tool_payload, Unset):
            tool_payload = self.tool_payload.to_dict()

        data: dict[str, Any] | Unset = UNSET
        if not isinstance(self.data, Unset):
            data = self.data.to_dict()

        error = self.error

        step_results: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.step_results, Unset):
            step_results = []
            for step_results_item_data in self.step_results:
                step_results_item = step_results_item_data.to_dict()
                step_results.append(step_results_item)

        options: dict[str, Any] | Unset = UNSET
        if not isinstance(self.options, Unset):
            options = self.options.to_dict()

        request_source = self.request_source

        trace_id = self.trace_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "runId": run_id,
                "toolId": tool_id,
                "status": status,
                "metadata": metadata,
            }
        )
        if tool is not UNSET:
            field_dict["tool"] = tool
        if tool_payload is not UNSET:
            field_dict["toolPayload"] = tool_payload
        if data is not UNSET:
            field_dict["data"] = data
        if error is not UNSET:
            field_dict["error"] = error
        if step_results is not UNSET:
            field_dict["stepResults"] = step_results
        if options is not UNSET:
            field_dict["options"] = options
        if request_source is not UNSET:
            field_dict["requestSource"] = request_source
        if trace_id is not UNSET:
            field_dict["traceId"] = trace_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.run_data import RunData
        from ..models.run_metadata import RunMetadata
        from ..models.run_options import RunOptions
        from ..models.run_step_results_item import RunStepResultsItem
        from ..models.run_tool import RunTool
        from ..models.run_tool_payload import RunToolPayload

        d = dict(src_dict)
        run_id = d.pop("runId")

        tool_id = d.pop("toolId")

        status = RunStatus(d.pop("status"))

        metadata = RunMetadata.from_dict(d.pop("metadata"))

        _tool = d.pop("tool", UNSET)
        tool: RunTool | Unset
        if isinstance(_tool, Unset):
            tool = UNSET
        else:
            tool = RunTool.from_dict(_tool)

        _tool_payload = d.pop("toolPayload", UNSET)
        tool_payload: RunToolPayload | Unset
        if isinstance(_tool_payload, Unset):
            tool_payload = UNSET
        else:
            tool_payload = RunToolPayload.from_dict(_tool_payload)

        _data = d.pop("data", UNSET)
        data: RunData | Unset
        if isinstance(_data, Unset):
            data = UNSET
        else:
            data = RunData.from_dict(_data)

        error = d.pop("error", UNSET)

        _step_results = d.pop("stepResults", UNSET)
        step_results: list[RunStepResultsItem] | Unset = UNSET
        if _step_results is not UNSET:
            step_results = []
            for step_results_item_data in _step_results:
                step_results_item = RunStepResultsItem.from_dict(step_results_item_data)

                step_results.append(step_results_item)

        _options = d.pop("options", UNSET)
        options: RunOptions | Unset
        if isinstance(_options, Unset):
            options = UNSET
        else:
            options = RunOptions.from_dict(_options)

        request_source = d.pop("requestSource", UNSET)

        trace_id = d.pop("traceId", UNSET)

        run = cls(
            run_id=run_id,
            tool_id=tool_id,
            status=status,
            metadata=metadata,
            tool=tool,
            tool_payload=tool_payload,
            data=data,
            error=error,
            step_results=step_results,
            options=options,
            request_source=request_source,
            trace_id=trace_id,
        )

        run.additional_properties = d
        return run

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
