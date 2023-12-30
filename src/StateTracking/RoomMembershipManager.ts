/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionError,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  Logger,
  MatrixRoomID,
  Ok,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  StringUserID,
  Value,
  isError,
} from 'matrix-protection-suite';
import { MembershipEvent } from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import { RoomStateManagerFactory } from '../ClientManagement/RoomStateManagerFactory';

const log = new Logger('BotSDKRoomMembershipManager');

async function getRoomMembershipEvents(
  room: MatrixRoomID,
  client: MatrixSendClient
): Promise<ActionResult<MembershipEvent[]>> {
  const rawMembersResult = await client
    .doRequest(
      'GET',
      `/_matrix/client/v3/rooms/${encodeURIComponent(
        room.toRoomIDOrAlias()
      )}/members`
    )
    .then(
      (ok) => Ok(ok),
      (exception) =>
        ActionException.Result(
          `Unable to query room members from ${room.toPermalink()}`,
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  if (isError(rawMembersResult)) {
    return rawMembersResult;
  }
  if (
    !('chunk' in rawMembersResult.ok) ||
    !Array.isArray(rawMembersResult.ok['chunk'])
  ) {
    const message = `Unable parse the result of a /members query in ${room.toPermalink()}`;
    log.error(message, rawMembersResult);
    return ActionError.Result(message);
  }
  const members: MembershipEvent[] = [];
  for (const rawEvent of rawMembersResult.ok['chunk']) {
    const memberResult = Value.Decode(MembershipEvent, rawEvent);
    if (isError(memberResult)) {
      log.error(
        `Unable to parse the event ${rawEvent.event_id} from ${rawEvent.room_id}`,
        JSON.stringify(rawEvent),
        memberResult.error
      );
      continue;
    }
    members.push(memberResult.ok);
  }
  return Ok(members);
}
export class BotSDKRoomMembershipManager implements RoomMembershipManager {
  public constructor(
    public readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly factory: RoomStateManagerFactory
  ) {
    // nothing to do.
  }

  public async getRoomMembershipRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>> {
    return await this.factory.getRoomMembershipRevisionIssuer(
      room,
      this.clientUserID
    );
  }

  public async getRoomMembershipEvents(
    room: MatrixRoomID
  ): Promise<ActionResult<MembershipEvent[]>> {
    return await getRoomMembershipEvents(room, this.client);
  }
}
