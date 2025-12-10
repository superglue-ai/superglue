from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.tool_step_failure_behavior import ToolStepFailureBehavior
from ..models.tool_step_method import ToolStepMethod
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.pagination import Pagination
    from ..models.tool_step_headers import ToolStepHeaders
    from ..models.tool_step_query_params import ToolStepQueryParams


T = TypeVar("T", bound="ToolStep")


@_attrs_define
class ToolStep:
    """A single execution step. Protocol is detected from URL scheme:
    - HTTP/HTTPS: Standard REST API calls with query params, headers, body
    - Postgres: postgres:// or postgresql:// URLs, body contains SQL query
    - FTP/SFTP: ftp://, ftps://, or sftp:// URLs, body contains operation details

        Attributes:
            id (str): Unique identifier for this step Example: 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.
            url (str): Full URL including protocol. Examples:
                - HTTP: https://api.example.com/search
                - Postgres: postgres://user:pass@host:5432/database
                - FTP: ftp://user:pass@host:21/path
                - SFTP: sftp://user:pass@host:22/path
                 Example: https://api.example.com/search.
            method (ToolStepMethod): HTTP method. For non-HTTP protocols, use POST. Example: GET.
            system_id (str): System to use for stored credentials and documentation Example:
                3f7c8d9e-1a2b-4c5d-8e9f-0a1b2c3d4e5f.
            query_params (ToolStepQueryParams | Unset): URL query parameters (HTTP only). Supports template expressions with
                <<(sourceData) => ...>> syntax. Example: {'q': '<<(sourceData) => sourceData.query>>', 'limit': 10}.
            headers (ToolStepHeaders | Unset): HTTP headers (HTTP only). Supports template expressions with <<(sourceData)
                => ...>> syntax. Example: {'Content-Type': 'application/json', 'Authorization': 'Bearer <<(sourceData) =>
                sourceData.credentials.apiKey>>'}.
            body (str | Unset): Request body (protocol-specific). Supports template expressions with <<(sourceData) => ...>>
                syntax.

                HTTP: Any content (JSON, XML, form data, etc.)
                Example: '{"query": "<<(sourceData) => sourceData.query>>"}'

                Postgres: JSON with query and optional params
                Example: '{"query": "SELECT * FROM users WHERE id = $1", "params": ["<<(sourceData) => sourceData.userId>>"]}'

                FTP/SFTP: JSON with operation, path, and optional content
                Example: '{"operation": "get", "path": "/data/file.csv"}'
                Example: '{"operation": "list", "path": "/data"}'
                Example: '{"operation": "put", "path": "/data/file.txt", "content": "<<(sourceData) =>
                sourceData.fileContent>>"}'
                 Example: {"query": "<<(sourceData) => sourceData.query>>"}.
            pagination (Pagination | Unset): Pagination configuration (HTTP/HTTPS only, not applicable to Postgres/FTP)
            instruction (str | Unset): Human-readable instruction describing what this step does Example: Fetch user details
                from the API.
            modify (bool | Unset): Whether this step can be modified by the self-healing system Default: False.
            data_selector (str | Unset): JavaScript function to select data for loop execution.
                Format: (sourceData) => expression
                 Example: (sourceData) => sourceData.data.items.
            failure_behavior (ToolStepFailureBehavior | Unset): How to handle step failures (fail stops execution, continue
                proceeds to next step) Default: ToolStepFailureBehavior.FAIL.
    """

    id: str
    url: str
    method: ToolStepMethod
    system_id: str
    query_params: ToolStepQueryParams | Unset = UNSET
    headers: ToolStepHeaders | Unset = UNSET
    body: str | Unset = UNSET
    pagination: Pagination | Unset = UNSET
    instruction: str | Unset = UNSET
    modify: bool | Unset = False
    data_selector: str | Unset = UNSET
    failure_behavior: ToolStepFailureBehavior | Unset = ToolStepFailureBehavior.FAIL
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        url = self.url

        method = self.method.value

        system_id = self.system_id

        query_params: dict[str, Any] | Unset = UNSET
        if not isinstance(self.query_params, Unset):
            query_params = self.query_params.to_dict()

        headers: dict[str, Any] | Unset = UNSET
        if not isinstance(self.headers, Unset):
            headers = self.headers.to_dict()

        body = self.body

        pagination: dict[str, Any] | Unset = UNSET
        if not isinstance(self.pagination, Unset):
            pagination = self.pagination.to_dict()

        instruction = self.instruction

        modify = self.modify

        data_selector = self.data_selector

        failure_behavior: str | Unset = UNSET
        if not isinstance(self.failure_behavior, Unset):
            failure_behavior = self.failure_behavior.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "url": url,
                "method": method,
                "systemId": system_id,
            }
        )
        if query_params is not UNSET:
            field_dict["queryParams"] = query_params
        if headers is not UNSET:
            field_dict["headers"] = headers
        if body is not UNSET:
            field_dict["body"] = body
        if pagination is not UNSET:
            field_dict["pagination"] = pagination
        if instruction is not UNSET:
            field_dict["instruction"] = instruction
        if modify is not UNSET:
            field_dict["modify"] = modify
        if data_selector is not UNSET:
            field_dict["dataSelector"] = data_selector
        if failure_behavior is not UNSET:
            field_dict["failureBehavior"] = failure_behavior

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.pagination import Pagination
        from ..models.tool_step_headers import ToolStepHeaders
        from ..models.tool_step_query_params import ToolStepQueryParams

        d = dict(src_dict)
        id = d.pop("id")

        url = d.pop("url")

        method = ToolStepMethod(d.pop("method"))

        system_id = d.pop("systemId")

        _query_params = d.pop("queryParams", UNSET)
        query_params: ToolStepQueryParams | Unset
        if isinstance(_query_params, Unset):
            query_params = UNSET
        else:
            query_params = ToolStepQueryParams.from_dict(_query_params)

        _headers = d.pop("headers", UNSET)
        headers: ToolStepHeaders | Unset
        if isinstance(_headers, Unset):
            headers = UNSET
        else:
            headers = ToolStepHeaders.from_dict(_headers)

        body = d.pop("body", UNSET)

        _pagination = d.pop("pagination", UNSET)
        pagination: Pagination | Unset
        if isinstance(_pagination, Unset):
            pagination = UNSET
        else:
            pagination = Pagination.from_dict(_pagination)

        instruction = d.pop("instruction", UNSET)

        modify = d.pop("modify", UNSET)

        data_selector = d.pop("dataSelector", UNSET)

        _failure_behavior = d.pop("failureBehavior", UNSET)
        failure_behavior: ToolStepFailureBehavior | Unset
        if isinstance(_failure_behavior, Unset):
            failure_behavior = UNSET
        else:
            failure_behavior = ToolStepFailureBehavior(_failure_behavior)

        tool_step = cls(
            id=id,
            url=url,
            method=method,
            system_id=system_id,
            query_params=query_params,
            headers=headers,
            body=body,
            pagination=pagination,
            instruction=instruction,
            modify=modify,
            data_selector=data_selector,
            failure_behavior=failure_behavior,
        )

        tool_step.additional_properties = d
        return tool_step

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
