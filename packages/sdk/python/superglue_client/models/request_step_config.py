from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.request_step_config_method import RequestStepConfigMethod
from ..models.request_step_config_type import RequestStepConfigType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.pagination import Pagination
    from ..models.request_step_config_headers import RequestStepConfigHeaders
    from ..models.request_step_config_query_params import RequestStepConfigQueryParams


T = TypeVar("T", bound="RequestStepConfig")


@_attrs_define
class RequestStepConfig:
    """Configuration for a request step. Protocol is detected from URL scheme:
    - HTTP/HTTPS: Standard REST API calls with query params, headers, body
    - Postgres: postgres:// or postgresql:// URLs, body contains SQL query
    - FTP/SFTP: ftp://, ftps://, or sftp:// URLs, body contains operation details

        Attributes:
            url (str): Full URL including protocol. Examples:
                - HTTP: https://api.example.com/search
                - Postgres: postgres://user:pass@host:5432/database
                - FTP: ftp://user:pass@host:21/path
                - SFTP: sftp://user:pass@host:22/path
                 Example: https://api.example.com/search.
            method (RequestStepConfigMethod): HTTP method. For non-HTTP protocols, use POST. Example: GET.
            type_ (Union[Unset, RequestStepConfigType]): Optional type discriminator (defaults to request)
            query_params (Union[Unset, RequestStepConfigQueryParams]): URL query parameters (HTTP only). Supports template
                expressions with <<(sourceData) => ...>> syntax. Example: {'q': '<<(sourceData) => sourceData.query>>', 'limit':
                10}.
            headers (Union[Unset, RequestStepConfigHeaders]): HTTP headers (HTTP only). Supports template expressions with
                <<(sourceData) => ...>> syntax. Example: {'Content-Type': 'application/json', 'Authorization': 'Bearer
                <<(sourceData) => sourceData.credentials.apiKey>>'}.
            body (Union[Unset, str]): Request body (protocol-specific). Supports template expressions with <<(sourceData) =>
                ...>> syntax.

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
            pagination (Union[Unset, Pagination]): Pagination configuration (HTTP/HTTPS only, not applicable to
                Postgres/FTP)
            system_id (Union[Unset, str]): System to use for stored credentials and documentation Example:
                3f7c8d9e-1a2b-4c5d-8e9f-0a1b2c3d4e5f.
    """

    url: str
    method: RequestStepConfigMethod
    type_: Union[Unset, RequestStepConfigType] = UNSET
    query_params: Union[Unset, "RequestStepConfigQueryParams"] = UNSET
    headers: Union[Unset, "RequestStepConfigHeaders"] = UNSET
    body: Union[Unset, str] = UNSET
    pagination: Union[Unset, "Pagination"] = UNSET
    system_id: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        url = self.url

        method = self.method.value

        type_: Union[Unset, str] = UNSET
        if not isinstance(self.type_, Unset):
            type_ = self.type_.value

        query_params: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.query_params, Unset):
            query_params = self.query_params.to_dict()

        headers: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.headers, Unset):
            headers = self.headers.to_dict()

        body = self.body

        pagination: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.pagination, Unset):
            pagination = self.pagination.to_dict()

        system_id = self.system_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "url": url,
                "method": method,
            }
        )
        if type_ is not UNSET:
            field_dict["type"] = type_
        if query_params is not UNSET:
            field_dict["queryParams"] = query_params
        if headers is not UNSET:
            field_dict["headers"] = headers
        if body is not UNSET:
            field_dict["body"] = body
        if pagination is not UNSET:
            field_dict["pagination"] = pagination
        if system_id is not UNSET:
            field_dict["systemId"] = system_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.pagination import Pagination
        from ..models.request_step_config_headers import RequestStepConfigHeaders
        from ..models.request_step_config_query_params import RequestStepConfigQueryParams

        d = dict(src_dict)
        url = d.pop("url")

        method = RequestStepConfigMethod(d.pop("method"))

        _type_ = d.pop("type", UNSET)
        type_: Union[Unset, RequestStepConfigType]
        if isinstance(_type_, Unset):
            type_ = UNSET
        else:
            type_ = RequestStepConfigType(_type_)

        _query_params = d.pop("queryParams", UNSET)
        query_params: Union[Unset, RequestStepConfigQueryParams]
        if isinstance(_query_params, Unset):
            query_params = UNSET
        else:
            query_params = RequestStepConfigQueryParams.from_dict(_query_params)

        _headers = d.pop("headers", UNSET)
        headers: Union[Unset, RequestStepConfigHeaders]
        if isinstance(_headers, Unset):
            headers = UNSET
        else:
            headers = RequestStepConfigHeaders.from_dict(_headers)

        body = d.pop("body", UNSET)

        _pagination = d.pop("pagination", UNSET)
        pagination: Union[Unset, Pagination]
        if isinstance(_pagination, Unset):
            pagination = UNSET
        else:
            pagination = Pagination.from_dict(_pagination)

        system_id = d.pop("systemId", UNSET)

        request_step_config = cls(
            url=url,
            method=method,
            type_=type_,
            query_params=query_params,
            headers=headers,
            body=body,
            pagination=pagination,
            system_id=system_id,
        )

        request_step_config.additional_properties = d
        return request_step_config

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
