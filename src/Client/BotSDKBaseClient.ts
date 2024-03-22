// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StaticDecode, Type } from '@sinclair/typebox';
import { MatrixError } from 'matrix-bot-sdk';
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  MatrixException,
  MatrixRoomID,
  MatrixRoomReference,
  Ok,
  RoomBanner,
  RoomCreateOptions,
  RoomCreator,
  RoomEventRedacter,
  RoomJoiner,
  RoomKicker,
  RoomStateEventSender,
  StringEventID,
  StringRoomAlias,
  StringRoomID,
  StringUserID,
  Value,
  isError,
  serverName,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';

const WeakError = Type.Object({
  message: Type.String(),
  name: Type.String(),
});

function toRoomID(room: MatrixRoomID | StringRoomID): StringRoomID {
  return typeof room === 'string' ? room : room.toRoomIDOrAlias();
}

function matrixExceptionFromMatrixError(
  error: MatrixError
): ActionResult<never, MatrixException> {
  return MatrixException.R({
    exception: error,
    matrixErrorCode: error.errcode,
    matrixErrorMessage: error.error,
    message: error.message,
  });
}

function actionExceptionFromWeakError(
  error: StaticDecode<typeof WeakError>
): ActionResult<never, ActionException> {
  return ActionException.Result(error.message, {
    exception: error,
    exceptionKind: ActionExceptionKind.Unknown,
  });
}

function unknownError(error: unknown): never {
  throw new TypeError(
    // Not sure what to do yet other than throw?
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    `What on earth are you throwing exactly? because it isn't an error ${error}`
  );
}

// Either i'm really tired right now or stupid.
// But I can't think of a way to share this definition with
// `resultifyBotSDKRequestError` without having never | undefined
// clients need to just have `never` when 404 isn't being checked!
export function resultifyBotSDKRequestErrorWith404AsUndefined(
  error: unknown
): ActionResult<undefined, ActionException> {
  if (error instanceof MatrixError) {
    if (error.statusCode === 404) {
      return Ok(undefined);
    }
    return matrixExceptionFromMatrixError(error);
  } else if (Value.Check(WeakError, error)) {
    return actionExceptionFromWeakError(error);
  } else {
    unknownError(error);
  }
}

export function resultifyBotSDKRequestError(
  error: unknown
): ActionResult<never, ActionException> {
  if (error instanceof MatrixError) {
    return matrixExceptionFromMatrixError(error);
  } else if (Value.Check(WeakError, error)) {
    return actionExceptionFromWeakError(error);
  } else {
    unknownError(error);
  }
}

export class BotSDKBaseClient
  implements
    RoomBanner,
    RoomCreator,
    RoomEventRedacter,
    RoomJoiner,
    RoomKicker,
    RoomStateEventSender
{
  public constructor(
    protected readonly client: MatrixSendClient,
    protected readonly clientUserID: StringUserID
  ) {
    // nothing to do.
  }

  protected preemptTimelineJoin(_roomID: StringRoomID): void {
    // nothing to do.
  }

  public async resolveRoom(
    room: MatrixRoomReference | StringRoomAlias | StringRoomID
  ): Promise<ActionResult<MatrixRoomID>> {
    const roomReference = (() => {
      if (typeof room === 'string') {
        return MatrixRoomReference.fromRoomIDOrAlias(room);
      } else {
        return room;
      }
    })();
    if (roomReference instanceof MatrixRoomID) {
      return Ok(roomReference);
    }
    return await this.client
      .resolveRoom(roomReference.toRoomIDOrAlias())
      .then(
        (roomID) =>
          Ok(
            MatrixRoomReference.fromRoomID(
              roomID as StringRoomID,
              roomReference.getViaServers()
            )
          ),
        resultifyBotSDKRequestError
      );
  }

  public async joinRoom(
    room: MatrixRoomReference | StringRoomID | StringRoomAlias
  ): Promise<ActionResult<MatrixRoomID>> {
    const resolvedReference = await this.resolveRoom(room);
    if (isError(resolvedReference)) {
      return resolvedReference;
    }
    return await this.client
      .joinRoom(
        resolvedReference.ok.toRoomIDOrAlias(),
        resolvedReference.ok.getViaServers()
      )
      .then((roomID) => {
        this.preemptTimelineJoin(roomID as StringRoomID);
        return Ok(
          MatrixRoomReference.fromRoomID(
            roomID as StringRoomID,
            resolvedReference.ok.getViaServers()
          )
        );
      }, resultifyBotSDKRequestError);
  }

  public async createRoom(
    options: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomID>> {
    return await this.client.createRoom(options).then((roomID) => {
      this.preemptTimelineJoin(roomID as StringRoomID);
      return Ok(
        MatrixRoomReference.fromRoomID(roomID as StringRoomID, [
          serverName(this.clientUserID),
        ])
      );
    }, resultifyBotSDKRequestError);
  }
  public async banUser(
    room: StringRoomID | MatrixRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>> {
    return await this.client
      .banUser(userID, toRoomID(room), reason)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async kickUser(
    room: StringRoomID | MatrixRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>> {
    return await this.client
      .kickUser(userID, toRoomID(room), reason)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async redactEvent(
    room: StringRoomID | MatrixRoomID,
    eventID: StringEventID,
    reason?: string
  ): Promise<ActionResult<StringEventID>> {
    return await this.client
      .redactEvent(toRoomID(room), eventID, reason)
      .then(
        (redactionEventID) => Ok(redactionEventID as StringEventID),
        resultifyBotSDKRequestError
      );
  }
  public async unbanUser(
    room: StringRoomID | MatrixRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>> {
    return await this.client
      .banUser(userID, toRoomID(room), reason)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async sendStateEvent(
    room: MatrixRoomID | StringRoomID,
    stateType: string,
    stateKey: string,
    content: Record<string, unknown>
  ): Promise<ActionResult<StringEventID>> {
    const roomID = room instanceof MatrixRoomID ? room.toRoomIDOrAlias() : room;
    return await this.client
      .sendStateEvent(roomID, stateType, stateKey, content)
      .then(
        (eventID) => Ok(eventID as StringEventID),
        resultifyBotSDKRequestError
      );
  }
}
