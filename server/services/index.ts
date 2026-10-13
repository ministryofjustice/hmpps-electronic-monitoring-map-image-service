import { AuditServiceFactory } from '@ministryofjustice/hmpps-audit-client'
import { dataAccess } from '../data'
import logger from '../../logger'
import config from '../config'

export const services = () => {
  const { applicationInfo } = dataAccess()

  const auditService = AuditServiceFactory.createInstance(config.sqs.audit, logger)

  return {
    applicationInfo,
    auditService,
  }
}

export type Services = ReturnType<typeof services>
