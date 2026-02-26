from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="RunRequestOptions")


@_attrs_define
class RunRequestOptions:
    """
    Attributes:
        async_ (bool | Unset): If true, return immediately (202) and execute asynchronously. If false, wait for
            completion (200). Default: False.
        timeout (int | Unset): Request timeout in seconds (only for synchronous execution)
        webhook_url (str | Unset): URL to receive completion webhook when run finishes (for both sync and async
            executions).
            Webhook receives POST request with Run object (same schema as getRun response) in body.
            Alternatively, a tool to run after - run via tool:toolId
             Example: https://your-app.com/webhooks/superglue.
        trace_id (str | Unset): Custom trace ID for log tracking Example: a1b2c3d4-e5f6-7890-abcd-ef1234567890.
    """

    async_: bool | Unset = False
    timeout: int | Unset = UNSET
    webhook_url: str | Unset = UNSET
    trace_id: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        async_ = self.async_

        timeout = self.timeout

        webhook_url = self.webhook_url

        trace_id = self.trace_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if async_ is not UNSET:
            field_dict["async"] = async_
        if timeout is not UNSET:
            field_dict["timeout"] = timeout
        if webhook_url is not UNSET:
            field_dict["webhookUrl"] = webhook_url
        if trace_id is not UNSET:
            field_dict["traceId"] = trace_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        async_ = d.pop("async", UNSET)

        timeout = d.pop("timeout", UNSET)

        webhook_url = d.pop("webhookUrl", UNSET)

        trace_id = d.pop("traceId", UNSET)

        run_request_options = cls(
            async_=async_,
            timeout=timeout,
            webhook_url=webhook_url,
            trace_id=trace_id,
        )

        run_request_options.additional_properties = d
        return run_request_options

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
