from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.run_request_credentials import RunRequestCredentials
    from ..models.run_request_inputs import RunRequestInputs
    from ..models.run_request_options import RunRequestOptions


T = TypeVar("T", bound="RunRequest")


@_attrs_define
class RunRequest:
    """
    Attributes:
        run_id (Union[Unset, str]): Optional pre-generated run ID. If not provided, server generates one.
            Useful for idempotency and tracking runs before they start.
             Example: 7f3e9c1a-2b4d-4e8f-9a3b-1c5d7e9f2a4b.
        inputs (Union[Unset, RunRequestInputs]): Tool-specific input parameters Example: {'query': 'latest AI news',
            'maxResults': 5}.
        credentials (Union[Unset, RunRequestCredentials]): Runtime credentials for systems (overrides stored system
            credentials if provided).
            WARNING: These credentials are not persisted. Use systems for stored credentials.
             Example: {'apiKey': 'sk_live_abc123def456', 'apiSecret': 'secret_xyz789'}.
        options (Union[Unset, RunRequestOptions]):
    """

    run_id: Union[Unset, str] = UNSET
    inputs: Union[Unset, "RunRequestInputs"] = UNSET
    credentials: Union[Unset, "RunRequestCredentials"] = UNSET
    options: Union[Unset, "RunRequestOptions"] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        run_id = self.run_id

        inputs: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.inputs, Unset):
            inputs = self.inputs.to_dict()

        credentials: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.credentials, Unset):
            credentials = self.credentials.to_dict()

        options: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.options, Unset):
            options = self.options.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if run_id is not UNSET:
            field_dict["runId"] = run_id
        if inputs is not UNSET:
            field_dict["inputs"] = inputs
        if credentials is not UNSET:
            field_dict["credentials"] = credentials
        if options is not UNSET:
            field_dict["options"] = options

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.run_request_credentials import RunRequestCredentials
        from ..models.run_request_inputs import RunRequestInputs
        from ..models.run_request_options import RunRequestOptions

        d = dict(src_dict)
        run_id = d.pop("runId", UNSET)

        _inputs = d.pop("inputs", UNSET)
        inputs: Union[Unset, RunRequestInputs]
        if isinstance(_inputs, Unset):
            inputs = UNSET
        else:
            inputs = RunRequestInputs.from_dict(_inputs)

        _credentials = d.pop("credentials", UNSET)
        credentials: Union[Unset, RunRequestCredentials]
        if isinstance(_credentials, Unset):
            credentials = UNSET
        else:
            credentials = RunRequestCredentials.from_dict(_credentials)

        _options = d.pop("options", UNSET)
        options: Union[Unset, RunRequestOptions]
        if isinstance(_options, Unset):
            options = UNSET
        else:
            options = RunRequestOptions.from_dict(_options)

        run_request = cls(
            run_id=run_id,
            inputs=inputs,
            credentials=credentials,
            options=options,
        )

        run_request.additional_properties = d
        return run_request

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
