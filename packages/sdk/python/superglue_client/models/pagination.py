from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.pagination_type import PaginationType
from ..types import UNSET, Unset

T = TypeVar("T", bound="Pagination")


@_attrs_define
class Pagination:
    """Pagination configuration (HTTP/HTTPS only, not applicable to Postgres/FTP)

    Attributes:
        type_ (PaginationType):  Example: cursorBased.
        page_size (str | Unset): Number of items per page. Becomes available as <<(sourceData) => sourceData.limit>> in
            request templates. Example: 50.
        cursor_path (str | Unset): JSONPath to extract next page cursor from response body (e.g. "meta.next_cursor" for
            {meta:{next_cursor:"abc"}}) Example: meta.next_cursor.
        stop_condition (str | Unset): JavaScript function to determine when to stop pagination. Format: (response,
            pageInfo) => boolean
            - response: Object with {data: ..., headers: ...} - access response body via response.data
            - pageInfo: Object with {page: number, offset: number, cursor: any, totalFetched: number}
            - Return true to STOP pagination, false to continue
             Example: (response, pageInfo) => !response.data.pagination.has_more.
    """

    type_: PaginationType
    page_size: str | Unset = UNSET
    cursor_path: str | Unset = UNSET
    stop_condition: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        page_size = self.page_size

        cursor_path = self.cursor_path

        stop_condition = self.stop_condition

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
            }
        )
        if page_size is not UNSET:
            field_dict["pageSize"] = page_size
        if cursor_path is not UNSET:
            field_dict["cursorPath"] = cursor_path
        if stop_condition is not UNSET:
            field_dict["stopCondition"] = stop_condition

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        type_ = PaginationType(d.pop("type"))

        page_size = d.pop("pageSize", UNSET)

        cursor_path = d.pop("cursorPath", UNSET)

        stop_condition = d.pop("stopCondition", UNSET)

        pagination = cls(
            type_=type_,
            page_size=page_size,
            cursor_path=cursor_path,
            stop_condition=stop_condition,
        )

        pagination.additional_properties = d
        return pagination

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
