/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  Ok,
} from 'matrix-protection-suite';
import { MatrixSendClient } from './MatrixEmitter';
import {
  MatrixRoomReference,
  MatrixRoomID,
} from '@the-draupnir-project/matrix-basic-types';

export async function resolveRoomReferenceSafe(
  client: MatrixSendClient,
  roomRef: MatrixRoomReference
): Promise<ActionResult<MatrixRoomID>> {
  if (roomRef instanceof MatrixRoomID) {
    return Ok(roomRef);
  }
  return await client.resolveRoom(roomRef.toRoomIDOrAlias()).then(
    (value) => Ok(new MatrixRoomID(value, roomRef.getViaServers())),
    (exception: unknown) =>
      ActionException.Result(
        `Failed to resolve the MatrixRoomReference ${roomRef.toPermalink()}`,
        {
          exception,
          exceptionKind: ActionExceptionKind.Unknown,
        }
      )
  );
}
