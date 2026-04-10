from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.tool import Tool


T = TypeVar("T", bound="ListToolsResponse200")


@_attrs_define
class ListToolsResponse200:
    """
    Attributes:
        data (Union[Unset, list['Tool']]):
        page (Union[Unset, int]):  Example: 1.
        limit (Union[Unset, int]):  Example: 50.
        total (Union[Unset, int]):  Example: 127.
        has_more (Union[Unset, bool]):  Example: True.
    """

    data: Union[Unset, list["Tool"]] = UNSET
    page: Union[Unset, int] = UNSET
    limit: Union[Unset, int] = UNSET
    total: Union[Unset, int] = UNSET
    has_more: Union[Unset, bool] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data: Union[Unset, list[dict[str, Any]]] = UNSET
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
        from ..models.tool import Tool

        d = dict(src_dict)
        data = []
        _data = d.pop("data", UNSET)
        for data_item_data in _data or []:
            data_item = Tool.from_dict(data_item_data)

            data.append(data_item)

        page = d.pop("page", UNSET)

        limit = d.pop("limit", UNSET)

        total = d.pop("total", UNSET)

        has_more = d.pop("hasMore", UNSET)

        list_tools_response_200 = cls(
            data=data,
            page=page,
            limit=limit,
            total=total,
            has_more=has_more,
        )

        list_tools_response_200.additional_properties = d
        return list_tools_response_200

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
