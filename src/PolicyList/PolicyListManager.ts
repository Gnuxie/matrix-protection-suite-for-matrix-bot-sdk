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
  ActionError,
  ActionResult,
  MatrixRoomReference,
  POLICY_ROOM_TYPE,
  SHORTCODE_EVENT_TYPE,
  PolicyRoomManager,
  RoomCreateOptions,
  POLICY_ROOM_TYPE_VARIANTS,
  UserID,
  MatrixRoomID,
  ActionException,
  ActionExceptionKind,
  Ok,
  isError,
  PolicyRuleEvent,
  isPolicyRuleEvent,
  PolicyRoomEditor,
  InternedInstanceFactory,
  PolicyRoomRevisionIssuer,
  PolicyRoomRevision,
  StandardPolicyRoomRevision,
  StandardPolicyRoomRevisionIssuer,
  CreateInstanceFromKey,
  StringRoomID,
  RoomStateManager,
  RoomStatePolicyRoomRevisionIssuer,
  PolicyRuleType,
  StringUserID,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import { BotSDKPolicyRoomEditor } from './PolicyListEditor';

class AbstractBotSDKPolicyRoomManager implements PolicyRoomManager {
  private readonly issuedLists: InternedInstanceFactory<
    StringRoomID,
    PolicyRoomRevisionIssuer,
    [MatrixRoomID]
  >;

  private readonly issuedEditors: InternedInstanceFactory<
    StringRoomID,
    PolicyRoomEditor,
    [MatrixRoomID]
  >;

  constructor(
    private readonly client: MatrixSendClient,
    policyRoomRevisionIssuerFactory: CreateInstanceFromKey<
      StringRoomID,
      PolicyRoomRevisionIssuer,
      [MatrixRoomID]
    >
  ) {
    this.issuedLists = new InternedInstanceFactory<
      StringRoomID,
      PolicyRoomRevisionIssuer,
      [MatrixRoomID]
    >(policyRoomRevisionIssuerFactory);
    this.issuedEditors = new InternedInstanceFactory<
      StringRoomID,
      PolicyRoomEditor,
      [MatrixRoomID]
    >(async (roomId: string, room: MatrixRoomID) => {
      const issuer = await this.getPolicyRoomRevisionIssuer(room);
      if (isError(issuer)) {
        return issuer;
      }
      const editor = new BotSDKPolicyRoomEditor(client, room, issuer.ok);
      return Ok(editor);
    });
  }
  public async getPolicyRoomEditor(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomEditor>> {
    return await this.issuedEditors.getInstance(room.toRoomIDOrAlias(), room);
  }

  public async createPolicyRoom(
    shortcode: string,
    invite: string[],
    createRoomOptions: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomID>> {
    const rawCreatorResult = await this.client.getUserId().then(
      (user) => Ok(user),
      (exception) =>
        ActionException.Result(
          'Could not create a list because we could not find the mxid of the list creator.',
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
    if (isError(rawCreatorResult)) {
      return rawCreatorResult;
    }
    const creator = new UserID(rawCreatorResult.ok);
    const powerLevels: RoomCreateOptions['power_level_content_override'] = {
      ban: 50,
      events: {
        'm.room.name': 100,
        'm.room.power_levels': 100,
      },
      events_default: 50, // non-default
      invite: 0,
      kick: 50,
      notifications: {
        room: 20,
      },
      redact: 50,
      state_default: 50,
      users: {
        [creator.toString()]: 100,
        ...invite.reduce((users, mxid) => ({ ...users, [mxid]: 50 }), {}),
      },
      users_default: 0,
    };
    const finalRoomCreateOptions: RoomCreateOptions = {
      // Support for MSC3784.
      creation_content: {
        type: POLICY_ROOM_TYPE,
      },
      preset: 'public_chat',
      invite,
      initial_state: [
        {
          type: SHORTCODE_EVENT_TYPE,
          state_key: '',
          content: { shortcode: shortcode },
        },
      ],
      power_level_content_override: powerLevels,
      ...createRoomOptions,
    };
    // Guard room type in case someone overwrites it when declaring custom creation_content in future code.
    const roomType = finalRoomCreateOptions.creation_content?.type;
    if (
      typeof roomType !== 'string' ||
      !POLICY_ROOM_TYPE_VARIANTS.includes(roomType)
    ) {
      throw new TypeError(
        `Creating a policy room with a type other than the policy room type is not supported, you probably don't want to do this.`
      );
    }
    return await this.client.createRoom(finalRoomCreateOptions).then(
      (roomId) => Ok(new MatrixRoomID(roomId, [creator.domain])),
      (exception) =>
        ActionException.Result(
          'Could not create a matrix room to serve as the new policy list.',
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }
  getPolicyRuleEvents(
    room: MatrixRoomReference
  ): Promise<ActionResult<PolicyRuleEvent[]>> {
    return this.client.getRoomState(room.toRoomIDOrAlias()).then(
      (events) => Ok(events.filter(isPolicyRuleEvent)),
      (exception) =>
        ActionError.Result(
          `Could not fetch the room state for the policy list ${room.toPermalink()} and so we are unable to fetch any policy rules.`,
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }
  public async getPolicyRoomRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>> {
    return await this.issuedLists.getInstance(room.toRoomIDOrAlias(), room);
  }
  protected async getInitialPolicyRoomRevision(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomRevision>> {
    const eventsResult = await this.getPolicyRuleEvents(room);
    if (isError(eventsResult)) {
      return eventsResult;
    }
    const revision = StandardPolicyRoomRevision.blankRevision(
      room
    ).reviseFromState(eventsResult.ok);
    return Ok(revision);
  }

  getEditablePolicyRoomIDs(
    editor: StringUserID,
    ruleType: PolicyRuleType
  ): MatrixRoomID[] {
    const editableRoomIDs = this.issuedLists
      .allInstances()
      .filter((issuer) => issuer.currentRevision.isAbleToEdit(editor, ruleType))
      .map((issuer) => issuer.currentRevision.room);
    return editableRoomIDs;
  }
}

export class BotSDKPolicyRoomManager
  extends AbstractBotSDKPolicyRoomManager
  implements PolicyRoomManager
{
  constructor(client: MatrixSendClient) {
    super(
      client,
      async (
        _key: string,
        room: MatrixRoomID
      ): Promise<ActionResult<PolicyRoomRevisionIssuer>> => {
        const initialRevisionResult = await this.getInitialPolicyRoomRevision(
          room
        );
        if (isError(initialRevisionResult)) {
          return initialRevisionResult;
        }
        const issuer = new StandardPolicyRoomRevisionIssuer(
          room,
          initialRevisionResult.ok,
          this
        );
        return Ok(issuer);
      }
    );
  }
}

export class BotSDKRoomStatePolicyRoomManager
  extends AbstractBotSDKPolicyRoomManager
  implements PolicyRoomManager
{
  constructor(client: MatrixSendClient, roomStateManager: RoomStateManager) {
    super(client, async (_key, room) => {
      const roomStateIssuer = await roomStateManager.getRoomStateRevisionIssuer(
        room
      );
      if (isError(roomStateIssuer)) {
        return roomStateIssuer;
      }
      return Ok(
        new RoomStatePolicyRoomRevisionIssuer(
          room,
          StandardPolicyRoomRevision.blankRevision(room),
          roomStateIssuer.ok
        )
      );
    });
  }
}
