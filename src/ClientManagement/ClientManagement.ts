/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ClientRooms,
  ClientsInRoomMap,
  Ok,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import {
  StringRoomID,
  StringUserID,
} from '@the-draupnir-project/matrix-basic-types';

export type ClientForUserID = (
  clientUserID: StringUserID
) => Promise<MatrixSendClient>;

export interface ClientManagement {
  clientsInRoomMap: ClientsInRoomMap;
  getClientRooms(
    clientUserID: StringUserID
  ): Promise<ActionResult<ClientRooms>>;
}

export async function joinedRoomsSafe(
  client: MatrixSendClient
): Promise<ActionResult<StringRoomID[]>> {
  return await client.getJoinedRooms().then(
    (rooms) => Ok(rooms as StringRoomID[]),
    (exception: unknown) =>
      ActionException.Result(`Unable to get joined rooms`, {
        exception,
        exceptionKind: ActionExceptionKind.Unknown,
      })
  );
}
