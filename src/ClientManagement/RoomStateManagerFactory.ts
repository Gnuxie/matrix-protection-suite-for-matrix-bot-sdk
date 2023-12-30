/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionError,
  ActionExceptionKind,
  ActionResult,
  ClientsInRoomMap,
  EventDecoder,
  InternedInstanceFactory,
  Logger,
  MatrixRoomID,
  MultipleErrors,
  Ok,
  PolicyRoomManager,
  PolicyRoomRevisionIssuer,
  PolicyRuleType,
  RoomEvent,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  RoomStateManager,
  RoomStateMembershipRevisionIssuer,
  RoomStatePolicyRoomRevisionIssuer,
  RoomStateRevisionIssuer,
  StandardPolicyRoomRevision,
  StandardRoomMembershipRevision,
  StandardRoomStateRevisionIssuer,
  StateEvent,
  StateTrackingMeta,
  StringRoomID,
  StringUserID,
  isError,
} from 'matrix-protection-suite';
import { ClientForUserID } from './ClientManagement';
import { MatrixSendClient } from '../MatrixEmitter';
import { BotSDKRoomMembershipManager } from '../StateTracking/RoomMembershipManager';
import { BotSDKPolicyRoomManager } from '../PolicyList/PolicyListManager';

const log = new Logger('RoomStateManagerFactory');

export class RoomStateManagerFactory {
  private readonly roomStateIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomStateRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const stateResult = await this.getRoomStateForRevisionIssuer(room);
    if (isError(stateResult)) {
      return stateResult;
    }
    return Ok(
      new StandardRoomStateRevisionIssuer(
        room,
        this.getRoomStateForRevisionIssuer,
        this.trackingMeta
      )
    );
  });

  private readonly getRoomStateForRevisionIssuer =
    this.getRoomStateForRevisionIssuerMethod.bind(this);

  private readonly policyRoomIssuers: InternedInstanceFactory<
    StringRoomID,
    PolicyRoomRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_key, room) => {
    const roomStateIssuer = await this.roomStateIssuers.getInstance(
      room.toRoomIDOrAlias(),
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

  private readonly roomMembershipIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomMembershipRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const stateIssuer = await this.roomStateIssuers.getInstance(
      room.toRoomIDOrAlias(),
      room
    );
    if (isError(stateIssuer)) {
      return stateIssuer;
    }
    return Ok(
      new RoomStateMembershipRevisionIssuer(
        room,
        StandardRoomMembershipRevision.blankRevision(room),
        stateIssuer.ok
      )
    );
  });

  constructor(
    private readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly clientProvider: ClientForUserID,
    private readonly eventDecoder: EventDecoder,
    private readonly trackingMeta: StateTrackingMeta
  ) {
    // nothing to do.
  }

  public static async getRoomRoomState(
    client: MatrixSendClient,
    eventDecoder: EventDecoder,
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    const decodeResults = await client
      .getRoomState(room.toRoomIDOrAlias())
      .then(
        (events) =>
          Ok(events.map((event) => eventDecoder.decodeStateEvent(event))),
        (exception: unknown) =>
          ActionError.Result(
            `Could not fetch the room state for the room ${room.toPermalink()}.`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
    if (isError(decodeResults)) {
      return decodeResults;
    }
    const errors: ActionError[] = [];
    const events: StateEvent[] = [];
    for (const result of decodeResults.ok) {
      if (isError(result)) {
        errors.push(result.error);
      } else {
        events.push(result.ok);
      }
    }
    log.error(
      `There were multiple errors while decoding state events for ${room.toPermalink()}`,
      MultipleErrors.Result(
        `Unable to decode state events in ${room.toPermalink()}`,
        { errors }
      )
    );
    return Ok(events);
  }

  public async getRoomState(
    client: MatrixSendClient,
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    return await RoomStateManagerFactory.getRoomRoomState(
      client,
      this.eventDecoder,
      room
    );
  }

  private async getRoomStateForRevisionIssuerMethod(
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    const managedClientsInRoom = this.clientsInRoomMap.getManagedUsersInRoom(
      room.toRoomIDOrAlias()
    );
    if (managedClientsInRoom.length === 0) {
      return ActionError.Result(
        `There is no managed client in the room ${room.toPermalink()} and so we cannot fetch the room state there.`
      );
    }
    const chosenClientUserID = managedClientsInRoom[0];
    const client = await this.clientProvider(chosenClientUserID);
    return await RoomStateManagerFactory.getRoomRoomState(
      client,
      this.eventDecoder,
      room
    );
  }

  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (this.clientsInRoomMap.isClientInRoom(clientUserID, roomID)) {
      return await this.roomStateIssuers.getInstance(
        room.toRoomIDOrAlias(),
        room
      );
    } else {
      return ActionError.Result(
        `The user ${clientUserID} is not joined to the room ${room.toPermalink()}`
      );
    }
  }

  public async getRoomStateManager(
    clientUserID: StringUserID
  ): Promise<RoomStateManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKRoomStateManager(clientUserID, client, this);
  }

  public async getPolicyRoomRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (this.clientsInRoomMap.isClientInRoom(clientUserID, roomID)) {
      return await this.policyRoomIssuers.getInstance(roomID, room);
    } else {
      return ActionError.Result(
        `The user ${clientUserID} is not joined to the room ${room.toPermalink()}`
      );
    }
  }

  public getEditablePolicyRoomIDs(
    editor: StringUserID,
    ruleType: PolicyRuleType
  ): MatrixRoomID[] {
    const editableRoomIDs = this.policyRoomIssuers
      .allInstances()
      .filter((issuer) => issuer.currentRevision.isAbleToEdit(editor, ruleType))
      .map((issuer) => issuer.currentRevision.room);
    return editableRoomIDs;
  }

  public async getPolicyRoomManager(
    clientUserID: StringUserID
  ): Promise<PolicyRoomManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKPolicyRoomManager(clientUserID, client, this);
  }

  public async getRoomMembershipRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (this.clientsInRoomMap.isClientInRoom(clientUserID, roomID)) {
      return await this.roomMembershipIssuers.getInstance(roomID, room);
    } else {
      return ActionError.Result(
        `The user ${clientUserID} is not joined to the room ${room.toPermalink()}`
      );
    }
  }

  public async getRoomMembershipManager(
    clientUserID: StringUserID
  ): Promise<RoomMembershipManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKRoomMembershipManager(clientUserID, client, this);
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (
      this.roomStateIssuers.hasInstance(roomID) &&
      ('state_key' in event || event.type === 'm.room.redaction')
    ) {
      const issuer = this.roomStateIssuers.getStoredInstance(roomID);
      if (issuer === undefined) {
        throw new TypeError(
          'Somehow the has method for the interned instances is lying or the code is wrong'
        );
      }
      issuer.updateForEvent(event);
    }
  }
}

class BotSDKRoomStateManager implements RoomStateManager {
  public constructor(
    public readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly factory: RoomStateManagerFactory
  ) {
    // nothing to do.
  }
  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    return await this.factory.getRoomStateRevisionIssuer(
      room,
      this.clientUserID
    );
  }
  public async getRoomState(
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    return await this.factory.getRoomState(this.client, room);
  }
}