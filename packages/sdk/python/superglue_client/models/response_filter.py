from collections.abc import Mapping
from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.response_filter_action import ResponseFilterAction
from ..models.response_filter_scope import ResponseFilterScope
from ..models.response_filter_target import ResponseFilterTarget
from ..types import UNSET, Unset

T = TypeVar("T", bound="ResponseFilter")


@_attrs_define
class ResponseFilter:
    """Filter configuration for response data

    Attributes:
        id (str): Unique identifier for this filter
        enabled (bool): Whether this filter is active
        target (ResponseFilterTarget): What to match against (keys, values, or both)
        pattern (str): Regex pattern to match
        action (ResponseFilterAction): Action to take when pattern matches
        name (Union[Unset, str]): Human-readable name for this filter
        mask_value (Union[Unset, str]): Value to use when masking (only for MASK action)
        scope (Union[Unset, ResponseFilterScope]): Scope of removal (only for REMOVE and MASK actions)
    """

    id: str
    enabled: bool
    target: ResponseFilterTarget
    pattern: str
    action: ResponseFilterAction
    name: Union[Unset, str] = UNSET
    mask_value: Union[Unset, str] = UNSET
    scope: Union[Unset, ResponseFilterScope] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        enabled = self.enabled

        target = self.target.value

        pattern = self.pattern

        action = self.action.value

        name = self.name

        mask_value = self.mask_value

        scope: Union[Unset, str] = UNSET
        if not isinstance(self.scope, Unset):
            scope = self.scope.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "enabled": enabled,
                "target": target,
                "pattern": pattern,
                "action": action,
            }
        )
        if name is not UNSET:
            field_dict["name"] = name
        if mask_value is not UNSET:
            field_dict["maskValue"] = mask_value
        if scope is not UNSET:
            field_dict["scope"] = scope

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        enabled = d.pop("enabled")

        target = ResponseFilterTarget(d.pop("target"))

        pattern = d.pop("pattern")

        action = ResponseFilterAction(d.pop("action"))

        name = d.pop("name", UNSET)

        mask_value = d.pop("maskValue", UNSET)

        _scope = d.pop("scope", UNSET)
        scope: Union[Unset, ResponseFilterScope]
        if isinstance(_scope, Unset):
            scope = UNSET
        else:
            scope = ResponseFilterScope(_scope)

        response_filter = cls(
            id=id,
            enabled=enabled,
            target=target,
            pattern=pattern,
            action=action,
            name=name,
            mask_value=mask_value,
            scope=scope,
        )

        response_filter.additional_properties = d
        return response_filter

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
