from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.tool_input_schema import ToolInputSchema
    from ..models.tool_output_schema import ToolOutputSchema
    from ..models.tool_step import ToolStep


T = TypeVar("T", bound="Tool")


@_attrs_define
class Tool:
    """A multi-step workflow tool that executes one or more protocol-specific operations

    Attributes:
        id (str):  Example: 550e8400-e29b-41d4-a716-446655440000.
        steps (list[ToolStep]): Ordered execution steps that make up this tool
        name (str | Unset):  Example: Web Search.
        version (str | Unset): Semantic version string (major.minor.patch) Example: 2.1.0.
        instruction (str | Unset): Human-readable instruction describing what the tool does Example: Search the web for
            the given query and return relevant results.
        input_schema (ToolInputSchema | Unset): JSON Schema for tool inputs Example: {'type': 'object', 'properties':
            {'query': {'type': 'string'}, 'maxResults': {'type': 'integer', 'default': 10}}, 'required': ['query']}.
        output_schema (ToolOutputSchema | Unset): JSON Schema for tool outputs (after transformations applied)
        output_transform (str | Unset): JavaScript function for final output transformation.
            Format: (sourceData) => expression
             Example: (sourceData) => sourceData.map(item => ({ id: item.id, title: item.name })).
        created_at (datetime.datetime | Unset):
        updated_at (datetime.datetime | Unset):
    """

    id: str
    steps: list[ToolStep]
    name: str | Unset = UNSET
    version: str | Unset = UNSET
    instruction: str | Unset = UNSET
    input_schema: ToolInputSchema | Unset = UNSET
    output_schema: ToolOutputSchema | Unset = UNSET
    output_transform: str | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        steps = []
        for steps_item_data in self.steps:
            steps_item = steps_item_data.to_dict()
            steps.append(steps_item)

        name = self.name

        version = self.version

        instruction = self.instruction

        input_schema: dict[str, Any] | Unset = UNSET
        if not isinstance(self.input_schema, Unset):
            input_schema = self.input_schema.to_dict()

        output_schema: dict[str, Any] | Unset = UNSET
        if not isinstance(self.output_schema, Unset):
            output_schema = self.output_schema.to_dict()

        output_transform = self.output_transform

        created_at: str | Unset = UNSET
        if not isinstance(self.created_at, Unset):
            created_at = self.created_at.isoformat()

        updated_at: str | Unset = UNSET
        if not isinstance(self.updated_at, Unset):
            updated_at = self.updated_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "steps": steps,
            }
        )
        if name is not UNSET:
            field_dict["name"] = name
        if version is not UNSET:
            field_dict["version"] = version
        if instruction is not UNSET:
            field_dict["instruction"] = instruction
        if input_schema is not UNSET:
            field_dict["inputSchema"] = input_schema
        if output_schema is not UNSET:
            field_dict["outputSchema"] = output_schema
        if output_transform is not UNSET:
            field_dict["outputTransform"] = output_transform
        if created_at is not UNSET:
            field_dict["createdAt"] = created_at
        if updated_at is not UNSET:
            field_dict["updatedAt"] = updated_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.tool_input_schema import ToolInputSchema
        from ..models.tool_output_schema import ToolOutputSchema
        from ..models.tool_step import ToolStep

        d = dict(src_dict)
        id = d.pop("id")

        steps = []
        _steps = d.pop("steps")
        for steps_item_data in _steps:
            steps_item = ToolStep.from_dict(steps_item_data)

            steps.append(steps_item)

        name = d.pop("name", UNSET)

        version = d.pop("version", UNSET)

        instruction = d.pop("instruction", UNSET)

        _input_schema = d.pop("inputSchema", UNSET)
        input_schema: ToolInputSchema | Unset
        if isinstance(_input_schema, Unset):
            input_schema = UNSET
        else:
            input_schema = ToolInputSchema.from_dict(_input_schema)

        _output_schema = d.pop("outputSchema", UNSET)
        output_schema: ToolOutputSchema | Unset
        if isinstance(_output_schema, Unset):
            output_schema = UNSET
        else:
            output_schema = ToolOutputSchema.from_dict(_output_schema)

        output_transform = d.pop("outputTransform", UNSET)

        _created_at = d.pop("createdAt", UNSET)
        created_at: datetime.datetime | Unset
        if isinstance(_created_at, Unset):
            created_at = UNSET
        else:
            created_at = isoparse(_created_at)

        _updated_at = d.pop("updatedAt", UNSET)
        updated_at: datetime.datetime | Unset
        if isinstance(_updated_at, Unset):
            updated_at = UNSET
        else:
            updated_at = isoparse(_updated_at)

        tool = cls(
            id=id,
            steps=steps,
            name=name,
            version=version,
            instruction=instruction,
            input_schema=input_schema,
            output_schema=output_schema,
            output_transform=output_transform,
            created_at=created_at,
            updated_at=updated_at,
        )

        tool.additional_properties = d
        return tool

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
