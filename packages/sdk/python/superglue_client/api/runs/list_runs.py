from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.list_runs_response_200 import ListRunsResponse200
from ...models.list_runs_status import ListRunsStatus
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    tool_id: str | Unset = UNSET,
    status: ListRunsStatus | Unset = UNSET,
    page: int | Unset = 1,
    limit: int | Unset = 50,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["toolId"] = tool_id

    json_status: str | Unset = UNSET
    if not isinstance(status, Unset):
        json_status = status.value

    params["status"] = json_status

    params["page"] = page

    params["limit"] = limit

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/runs",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ListRunsResponse200 | None:
    if response.status_code == 200:
        response_200 = ListRunsResponse200.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ListRunsResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    tool_id: str | Unset = UNSET,
    status: ListRunsStatus | Unset = UNSET,
    page: int | Unset = 1,
    limit: int | Unset = 50,
) -> Response[ListRunsResponse200]:
    """List runs

    Args:
        tool_id (str | Unset):
        status (ListRunsStatus | Unset):
        page (int | Unset):  Default: 1.
        limit (int | Unset):  Default: 50.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ListRunsResponse200]
    """

    kwargs = _get_kwargs(
        tool_id=tool_id,
        status=status,
        page=page,
        limit=limit,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    tool_id: str | Unset = UNSET,
    status: ListRunsStatus | Unset = UNSET,
    page: int | Unset = 1,
    limit: int | Unset = 50,
) -> ListRunsResponse200 | None:
    """List runs

    Args:
        tool_id (str | Unset):
        status (ListRunsStatus | Unset):
        page (int | Unset):  Default: 1.
        limit (int | Unset):  Default: 50.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ListRunsResponse200
    """

    return sync_detailed(
        client=client,
        tool_id=tool_id,
        status=status,
        page=page,
        limit=limit,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    tool_id: str | Unset = UNSET,
    status: ListRunsStatus | Unset = UNSET,
    page: int | Unset = 1,
    limit: int | Unset = 50,
) -> Response[ListRunsResponse200]:
    """List runs

    Args:
        tool_id (str | Unset):
        status (ListRunsStatus | Unset):
        page (int | Unset):  Default: 1.
        limit (int | Unset):  Default: 50.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ListRunsResponse200]
    """

    kwargs = _get_kwargs(
        tool_id=tool_id,
        status=status,
        page=page,
        limit=limit,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    tool_id: str | Unset = UNSET,
    status: ListRunsStatus | Unset = UNSET,
    page: int | Unset = 1,
    limit: int | Unset = 50,
) -> ListRunsResponse200 | None:
    """List runs

    Args:
        tool_id (str | Unset):
        status (ListRunsStatus | Unset):
        page (int | Unset):  Default: 1.
        limit (int | Unset):  Default: 50.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ListRunsResponse200
    """

    return (
        await asyncio_detailed(
            client=client,
            tool_id=tool_id,
            status=status,
            page=page,
            limit=limit,
        )
    ).parsed
