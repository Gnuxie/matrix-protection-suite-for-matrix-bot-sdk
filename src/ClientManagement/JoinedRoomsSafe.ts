/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionException,
  ActionExceptionKind,
  JoinedRoomsSafe,
  Ok,
  StringRoomID,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';

export function makeJoinedRoomsSafe(
  client: MatrixSendClient,
  clientUserID: StringRoomID
): JoinedRoomsSafe {
  return () => {
    return client.getJoinedRooms().then(
      (rooms) => Ok(rooms as StringRoomID[]),
      (exception: unknown) =>
        ActionException.Result(
          `Unable to fetch the joined rooms for ${clientUserID}`,
          {
            exception,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        )
    );
  };
}
