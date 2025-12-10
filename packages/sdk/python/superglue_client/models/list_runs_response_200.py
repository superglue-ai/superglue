from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.run import Run


T = TypeVar("T", bound="ListRunsResponse200")


@_attrs_define
class ListRunsResponse200:
    """
    Attributes:
        data (list[Run] | Unset):
        page (int | Unset):  Example: 1.
        limit (int | Unset):  Example: 50.
        total (int | Unset):  Example: 327.
        has_more (bool | Unset):  Example: True.
    """

    data: list[Run] | Unset = UNSET
    page: int | Unset = UNSET
    limit: int | Unset = UNSET
    total: int | Unset = UNSET
    has_more: bool | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.data, Unset):
            data = []
            for data_item_data in self.data:
                data_item = data_item_data.to_dict()
                data.append(data_item)

        page = self.page

        limit = self.limit

        total = self.total

        has_more = self.has_more

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if data is not UNSET:
            field_dict["data"] = data
        if page is not UNSET:
            field_dict["page"] = page
        if limit is not UNSET:
            field_dict["limit"] = limit
        if total is not UNSET:
            field_dict["total"] = total
        if has_more is not UNSET:
            field_dict["hasMore"] = has_more

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.run import Run

        d = dict(src_dict)
        _data = d.pop("data", UNSET)
        data: list[Run] | Unset = UNSET
        if _data is not UNSET:
            data = []
            for data_item_data in _data:
                data_item = Run.from_dict(data_item_data)

                data.append(data_item)

        page = d.pop("page", UNSET)

        limit = d.pop("limit", UNSET)

        total = d.pop("total", UNSET)

        has_more = d.pop("hasMore", UNSET)

        list_runs_response_200 = cls(
            data=data,
            page=page,
            limit=limit,
            total=total,
            has_more=has_more,
        )

        list_runs_response_200.additional_properties = d
        return list_runs_response_200

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
