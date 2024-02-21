// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ClientPlatform,
  ClientRooms,
  MatrixException,
  MatrixRoomID,
  MatrixRoomReference,
  Ok,
  RoomCreateOptions,
  RoomCreator,
  RoomJoiner,
  RoomResolver,
  StringEventID,
  StringRoomAlias,
  StringRoomID,
  Value,
  isError,
  serverName,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import { MatrixError } from 'matrix-bot-sdk';
import { StaticDecode, Type } from '@sinclair/typebox';
import { RoomStateEventSender } from 'matrix-protection-suite/dist/Client/RoomStateEventSender';

const WeakError = Type.Object({
  message: Type.String(),
  name: Type.String(),
});

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

/**
 * This is a client that implements all granular capabilities specified in the
 * matrix-protection-suite. We depeond on the type system to enforce the attenuation
 * of capabilities, which is completely wrong. We should have the abilitiy to create
 * purpose built capabilities by using mixins, but this would require desgining
 * a purpose built object system on top of JS and this is something that would
 * take time and consideration to do properly.
 */
export class BotSDKAllClient
  implements RoomJoiner, RoomCreator, RoomStateEventSender
{
  public constructor(
    private readonly client: MatrixSendClient,
    private readonly clientRooms: ClientRooms
  ) {
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
        this.clientRooms.preemptTimelineJoin(roomID as StringRoomID);
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
      this.clientRooms.preemptTimelineJoin(roomID as StringRoomID);
      return Ok(
        MatrixRoomReference.fromRoomID(roomID as StringRoomID, [
          serverName(this.clientRooms.clientUserID),
        ])
      );
    }, resultifyBotSDKRequestError);
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

export class BotSDKClientPlatform implements ClientPlatform {
  constructor(private readonly allClient: BotSDKAllClient) {
    // nothing to do,
  }
  toRoomCreator(): RoomCreator {
    return this.allClient;
  }
  toRoomJoiner(): RoomJoiner {
    return this.allClient;
  }
  toRoomResolver(): RoomResolver {
    return this.allClient;
  }
  toRoomStateEventSender(): RoomStateEventSender {
    return this.allClient;
  }
}
