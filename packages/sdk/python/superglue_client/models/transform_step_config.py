from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.transform_step_config_type import TransformStepConfigType

T = TypeVar("T", bound="TransformStepConfig")


@_attrs_define
class TransformStepConfig:
    """Configuration for a transform step. Transform steps execute JavaScript code
    to reshape data between request steps without making external API calls.

        Attributes:
            type_ (TransformStepConfigType): Type discriminator for transform steps
            transform_code (str): JavaScript function that transforms sourceData.
                Format: (sourceData) => transformedData
                The function receives all previous step results and payload data.
                 Example: (sourceData) => sourceData.getUsers.data.map(u => ({ id: u.id, name: u.fullName })).
    """

    type_: TransformStepConfigType
    transform_code: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        transform_code = self.transform_code

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
                "transformCode": transform_code,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        type_ = TransformStepConfigType(d.pop("type"))

        transform_code = d.pop("transformCode")

        transform_step_config = cls(
            type_=type_,
            transform_code=transform_code,
        )

        transform_step_config.additional_properties = d
        return transform_step_config

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
