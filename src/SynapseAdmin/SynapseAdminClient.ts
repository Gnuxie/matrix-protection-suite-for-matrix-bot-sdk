/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  EDStatic,
  Ok,
  SynapseAdminDeleteRoomRequest,
  SynapseAdminGetUserAdminResponse,
  SynapseAdminPostUserDeactivateRequest,
  SynapseReport,
  Value,
  isError,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import {
  StringRoomID,
  StringUserID,
} from '@the-draupnir-project/matrix-basic-types';
import { Type } from '@sinclair/typebox';
import {
  resultifyBotSDKRequestError,
  resultifyBotSDKRequestErrorWith404AsUndefined,
} from '../Client/BotSDKBaseClient';
import { SynapseRoomShutdownV2RequestBody } from './ShutdownV2Endpoint';
import { BlockStatusResponse } from './BlockStatusEndpoint';
import { RoomDetailsResponse } from './RoomDetailsEndpoint';

const ReportPollResponse = Type.Object({
  event_reports: Type.Array(SynapseReport),
  next_token: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  total: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
});
type ReportPollResponse = EDStatic<typeof ReportPollResponse>;

export class SynapseAdminClient {
  constructor(
    private readonly client: MatrixSendClient,
    private readonly clientUserID: StringUserID
  ) {
    // nothing to do.
  }

  public async isSynapseAdmin(): Promise<ActionResult<boolean>> {
    const endpoint = `/_synapse/admin/v1/users/${encodeURIComponent(
      this.clientUserID
    )}/admin`;
    const response = await this.client.doRequest('GET', endpoint).then(
      (value) => Ok(value),
      (exception: unknown) =>
        ActionException.Result(
          `Unable to query whether the user ${this.clientUserID} is a Synapse Admin`,
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
    if (isError(response)) {
      return response;
    }
    const decodedResult = Value.Decode(
      SynapseAdminGetUserAdminResponse,
      response.ok
    );
    if (isError(decodedResult)) {
      return decodedResult;
    } else {
      return Ok(decodedResult.ok.admin ?? false);
    }
  }

  public async deactivateUser(
    targetUserID: StringUserID,
    { erase = false }: SynapseAdminPostUserDeactivateRequest = {}
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/deactivate/${encodeURIComponent(
      targetUserID
    )}`;
    return await this.client
      .doRequest('POST', endpoint, undefined, { erase })
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to deactivate the user ${targetUserID}`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
  }

  public async deleteRoom(
    roomID: StringRoomID,
    { block = true, ...otherOptions }: SynapseAdminDeleteRoomRequest = {}
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(roomID)}`;
    return await this.client
      .doRequest('DELETE', endpoint, null, {
        new_room_user_id: this.clientUserID,
        block,
        ...otherOptions,
      })
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(`Unable to delete the room ${roomID}`, {
            exception,
            exceptionKind: ActionExceptionKind.Unknown,
          })
      );
  }

  /**
   * Make a user administrator via the Synapse Admin API
   * @param roomId the room where the user (or the bot) shall be made administrator.
   * @param userId optionally specify the user mxID to be made administrator.
   */
  public async makeUserRoomAdmin(
    roomID: StringRoomID,
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(
      roomID
    )}/make_room_admin`;
    return await this.client
      .doRequest('POST', endpoint, null, {
        user_id: userID,
      })
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to make the user ${userID} admin in room ${roomID}`,
            {
              exception,
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }

  public async getAbuseReports({
    from,
    direction,
    limit,
  }: { from?: number; direction?: 'f' | 'b'; limit?: number } = {}): Promise<
    ActionResult<ReportPollResponse>
  > {
    const endpoint = '/_synapse/admin/v1/event_reports';
    const queryParams = {
      ...(from ? { from } : {}),
      ...(direction ? { dir: direction } : {}),
      ...(limit ? { limit } : {}),
    };
    const response = await this.client
      .doRequest('GET', endpoint, queryParams)
      .then((value) => Ok(value), resultifyBotSDKRequestError);
    if (isError(response)) {
      return response;
    }
    return Value.Decode(ReportPollResponse, response.ok);
  }

  public async shutdownRoomV2(
    roomID: StringRoomID,
    options: SynapseRoomShutdownV2RequestBody
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v2/rooms/${encodeURIComponent(roomID)}`;
    return await this.client
      .doRequest('DELETE', endpoint, null, options)
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async getBlockStatus(
    roomID: StringRoomID
  ): Promise<ActionResult<BlockStatusResponse>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(
      roomID
    )}/block`;
    return await this.client
      .doRequest('GET', endpoint)
      .then(
        (value) => Value.Decode(BlockStatusResponse, value),
        resultifyBotSDKRequestError
      );
  }

  public async getRoomDetails(
    roomID: StringRoomID
  ): Promise<ActionResult<RoomDetailsResponse | undefined>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(roomID)}`;
    return await this.client.doRequest('GET', endpoint).then((value) => {
      return Value.Decode(RoomDetailsResponse, value);
    }, resultifyBotSDKRequestErrorWith404AsUndefined);
  }

  public async suspendUser(userID: StringUserID): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/suspend/${encodeURIComponent(userID)}`;
    return await this.client
      .doRequest('PUT', endpoint, null, { suspend: true })
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async unsuspendUser(
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/suspend/${encodeURIComponent(userID)}`;
    return await this.client
      .doRequest('PUT', endpoint, null, { suspend: false })
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }
}
