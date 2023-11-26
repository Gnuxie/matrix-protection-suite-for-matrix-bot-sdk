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
  MatrixRoomID,
  Ok,
  PolicyRoomEditor,
  PolicyListRevisionIssuer,
  PolicyRule,
  PolicyRuleType,
  Recommendation,
  isError,
  isPolicyRuleEvent,
  variantsForPolicyRuleType,
} from 'matrix-protection-suite';
import { SHA256 } from 'crypto-js';
import Base64 from 'crypto-js/enc-base64';
import { MatrixSendClient } from '../MatrixEmitter';

export class BotSDKPolicyRoomEditor implements PolicyRoomEditor {
  constructor(
    private readonly client: MatrixSendClient,
    private readonly room: MatrixRoomID,
    private readonly revisionIssuer: PolicyListRevisionIssuer
  ) {
    // nothing to do.
  }
  public async createPolicy(
    entityType: PolicyRuleType,
    recommendation: Recommendation,
    entity: string,
    reason: string,
    additionalProperties: Record<string, unknown>
  ): Promise<ActionResult<string>> {
    const stateKey = Base64.stringify(SHA256(entity + recommendation));
    return await this.client
      .sendStateEvent(this.room.toRoomIDOrAlias(), entityType, stateKey, {
        recommendation,
        entity,
        reason,
        ...additionalProperties,
      })
      .then(
        (eventId) => Ok(eventId),
        (exception) =>
          ActionException.Result(
            `Failed to create a policy for the entity ${entity} with the recommendation ${recommendation} in ${this.room.toPermalink()}`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
  }
  public async removePolicy(
    ruleType: PolicyRuleType,
    recommendation: Recommendation,
    entity: string,
    _reason?: string | undefined
  ): Promise<ActionResult<PolicyRule[]>> {
    const eventTypesToCheck = variantsForPolicyRuleType(ruleType);
    const sendNullState = async (
      stateType: string,
      stateKey: string
    ): Promise<ActionResult<void>> => {
      return await this.client
        .sendStateEvent(this.room.toRoomIDOrAlias(), stateType, stateKey, {})
        .then(
          (_eventId) => Ok(undefined),
          (exception) =>
            ActionException.Result(
              `Could not remove the rule ${ruleType} for entity ${entity} with recommendation ${recommendation}.`,
              { exception, exceptionKind: ActionExceptionKind.Unknown }
            )
        );
    };
    const checkForStateEvent = async (
      stateType: string,
      stateKey: string
    ): Promise<ActionResult<string | null>> => {
      return await this.client
        .getRoomStateEvent(this.room.toRoomIDOrAlias(), stateType, stateKey)
        .then(
          (event) => {
            if (!isPolicyRuleEvent(event)) {
              return Ok(null);
            }
            if (event.content.recommendation === recommendation) {
              return Ok(stateType);
            } else {
              return Ok(null);
            }
          },
          (exception) =>
            exception.stausCode === 404
              ? Ok(null)
              : ActionException.Result(
                  `Could not check for the presence of a policy event in order to remove it.`,
                  { exception, exceptionKind: ActionExceptionKind.Unknown }
                )
        );
    };
    const removeRule = async (
      rule: PolicyRule
    ): Promise<ActionResult<void>> => {
      const stateKey = rule.sourceEvent.state_key;
      // We can't cheat and check our state cache because we normalize the event types to the most recent version.
      const typesToRemoveResults = await Promise.all(
        eventTypesToCheck.map((stateType) =>
          checkForStateEvent(stateType, stateKey)
        )
      );
      if (typesToRemoveResults.length === 0) {
        return Ok(undefined);
      }
      if (typesToRemoveResults.filter(isError).length > 0) {
        const error = typesToRemoveResults.find(isError);
        if (error === undefined) {
          throw new TypeError(
            'This should be imposible because we just asserted that an error existed in the list'
          );
        }
        return error;
      }
      const removalResults = await Promise.all(
        typesToRemoveResults.map((stateTypeResult) => {
          if (isError(stateTypeResult)) {
            throw new TypeError();
          }
          if (stateTypeResult.ok === null) {
            return Promise.resolve(Ok(undefined));
          }
          return sendNullState(stateTypeResult.ok, stateKey);
        })
      );
      const removalErrors = removalResults.filter(isError);
      if (removalErrors.length > 0) {
        return removalErrors[0];
      } else {
        return Ok(undefined);
      }
    };
    const rules = this.revisionIssuer.currentRevision.allRulesMatchingEntity(
      entity,
      ruleType
    );
    const removalErrors = (await Promise.all(rules.map(removeRule))).filter(
      isError
    );
    if (removalErrors.length > 0) {
      return removalErrors[0];
    } else {
      return Ok(rules);
    }
  }
  public async banEntity(
    ruleType: PolicyRuleType,
    entity: string,
    reason?: string | undefined
  ): Promise<ActionResult<string>> {
    return await this.createPolicy(
      ruleType,
      Recommendation.Ban,
      entity,
      reason ?? '<no reason supplied>',
      {}
    );
  }
  public async unbanEntity(
    ruleType: PolicyRuleType,
    entity: string
  ): Promise<ActionResult<PolicyRule[]>> {
    return await this.removePolicy(ruleType, Recommendation.Ban, entity);
  }
}
