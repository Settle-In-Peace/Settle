import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum OrgRole {
  ORG_OWNER = 'org_owner',
  ORG_MANAGER = 'org_manager',
  AGENT = 'agent',
}

export enum OrgMemberStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  SUSPENDED = 'suspended',
}

/**
 * org_members — which users belong to which org and their tenant role.
 * Separate from `seats`: an org owner/manager need not consume a dialing
 * seat, and a suspended member keeps their row for audit.
 */
@Entity('org_members')
@Unique(['orgId', 'userId'])
export class OrgMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id' })
  @Index()
  orgId: string;

  /** users.id */
  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: OrgRole,
    enumName: 'org_role_enum',
    name: 'org_role',
    default: OrgRole.AGENT,
  })
  orgRole: OrgRole;

  @Column({
    type: 'enum',
    enum: OrgMemberStatus,
    enumName: 'org_member_status_enum',
    default: OrgMemberStatus.ACTIVE,
  })
  status: OrgMemberStatus;

  @Column({ name: 'invited_by', nullable: true })
  invitedBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
