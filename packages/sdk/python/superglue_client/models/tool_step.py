from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.tool_step_failure_behavior import ToolStepFailureBehavior
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.request_step_config import RequestStepConfig
    from ..models.transform_step_config import TransformStepConfig


T = TypeVar("T", bound="ToolStep")


@_attrs_define
class ToolStep:
    """A single execution step containing either a request configuration (API call)
    or a transform configuration (data transformation).

        Attributes:
            id (str): Unique identifier for this step Example: 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.
            config (Union['RequestStepConfig', 'TransformStepConfig']):
            instruction (Union[Unset, str]): Human-readable instruction describing what this step does Example: Fetch user
                details from the API.
            modify (Union[Unset, bool]): Whether this step modifies data on the system it operates on Default: False.
            data_selector (Union[Unset, str]): JavaScript function to select data for loop execution.
                Format: (sourceData) => expression
                 Example: (sourceData) => sourceData.data.items.
            failure_behavior (Union[Unset, ToolStepFailureBehavior]): How to handle step failures (fail stops execution,
                continue proceeds to next step) Default: ToolStepFailureBehavior.FAIL.
    """

    id: str
    config: Union["RequestStepConfig", "TransformStepConfig"]
    instruction: Union[Unset, str] = UNSET
    modify: Union[Unset, bool] = False
    data_selector: Union[Unset, str] = UNSET
    failure_behavior: Union[Unset, ToolStepFailureBehavior] = ToolStepFailureBehavior.FAIL
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.request_step_config import RequestStepConfig

        id = self.id

        config: dict[str, Any]
        if isinstance(self.config, RequestStepConfig):
            config = self.config.to_dict()
        else:
            config = self.config.to_dict()

        instruction = self.instruction

        modify = self.modify

        data_selector = self.data_selector

        failure_behavior: Union[Unset, str] = UNSET
        if not isinstance(self.failure_behavior, Unset):
            failure_behavior = self.failure_behavior.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "config": config,
            }
        )
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
        from ..models.request_step_config import RequestStepConfig
        from ..models.transform_step_config import TransformStepConfig

        d = dict(src_dict)
        id = d.pop("id")

        def _parse_config(data: object) -> Union["RequestStepConfig", "TransformStepConfig"]:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_step_config_type_0 = RequestStepConfig.from_dict(data)

                return componentsschemas_step_config_type_0
            except:  # noqa: E722
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_step_config_type_1 = TransformStepConfig.from_dict(data)

            return componentsschemas_step_config_type_1

        config = _parse_config(d.pop("config"))

        instruction = d.pop("instruction", UNSET)

        modify = d.pop("modify", UNSET)

        data_selector = d.pop("dataSelector", UNSET)

        _failure_behavior = d.pop("failureBehavior", UNSET)
        failure_behavior: Union[Unset, ToolStepFailureBehavior]
        if isinstance(_failure_behavior, Unset):
            failure_behavior = UNSET
        else:
            failure_behavior = ToolStepFailureBehavior(_failure_behavior)

        tool_step = cls(
            id=id,
            config=config,
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
