import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Group, GroupDoc } from './groups.schema';

@Injectable()
export class GroupsService {
  constructor(@InjectModel(Group.name) private groupModel: Model<GroupDoc>) {}

  async createGroup(
    name: string,
    description: string,
    createdBy: string,
    members: string[] = [],
  ): Promise<GroupDoc> {
    if (!name?.trim()) {
      throw new BadRequestException('Group name cannot be empty');
    }

    const creatorId = new Types.ObjectId(createdBy);
    const memberIds = members.map((id) => new Types.ObjectId(id));

    // Ensure creator is in members
    if (!memberIds.some((id) => id.equals(creatorId))) {
      memberIds.push(creatorId);
    }

    const group = new this.groupModel({
      name: name.trim(),
      description: description?.trim(),
      createdBy: creatorId,
      members: memberIds,
      admins: [creatorId], // Creator is admin by default
    });

    return group.save();
  }

  async addMember(
    groupId: string,
    userId: string,
    addedBy: string,
  ): Promise<GroupDoc> {
    const group = await this.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const userObjectId = new Types.ObjectId(userId);
    const adderObjectId = new Types.ObjectId(addedBy);

    // Check if adder is admin or creator
    const isAdmin = group.admins.some((admin) => admin.equals(adderObjectId));
    const isCreator = group.createdBy.equals(adderObjectId);

    if (!isAdmin && !isCreator) {
      throw new BadRequestException('Only admins can add members');
    }

    // Check if user is already a member
    if (group.members.some((member) => member.equals(userObjectId))) {
      throw new BadRequestException('User is already a member');
    }

    // Check max members limit
    if (group.maxMembers > 0 && group.members.length >= group.maxMembers) {
      throw new BadRequestException('Group has reached maximum members limit');
    }

    group.members.push(userObjectId);
    return group.save();
  }

  async removeMember(
    groupId: string,
    userId: string,
    removedBy: string,
  ): Promise<GroupDoc> {
    const group = await this.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const userObjectId = new Types.ObjectId(userId);
    const removerObjectId = new Types.ObjectId(removedBy);

    // Check if remover is admin or creator
    const isAdmin = group.admins.some((admin) => admin.equals(removerObjectId));
    const isCreator = group.createdBy.equals(removerObjectId);

    if (!isAdmin && !isCreator) {
      throw new BadRequestException('Only admins can remove members');
    }

    // Cannot remove creator
    if (userObjectId.equals(group.createdBy)) {
      throw new BadRequestException('Cannot remove group creator');
    }

    // Remove from members
    group.members = group.members.filter(
      (member) => !member.equals(userObjectId),
    );

    // Remove from admins if they were admin
    group.admins = group.admins.filter((admin) => !admin.equals(userObjectId));

    return group.save();
  }

  async getUserGroups(userId: string): Promise<GroupDoc[]> {
    const userObjectId = new Types.ObjectId(userId);
    return this.groupModel
      .find({ members: userObjectId })
      .populate('createdBy', 'username avatar')
      .populate('members', 'username avatar online')
      .populate('admins', 'username avatar')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<GroupDoc | null> {
    const groupId = new Types.ObjectId(id);
    return this.groupModel.findById(groupId).exec();
  }

  async updateGroup(
    groupId: string,
    updates: Partial<Group>,
    updatedBy: string,
  ): Promise<GroupDoc> {
    const group = await this.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const updaterObjectId = new Types.ObjectId(updatedBy);

    // Check if updater is admin or creator
    const isAdmin = group.admins.some((admin) => admin.equals(updaterObjectId));
    const isCreator = group.createdBy.equals(updaterObjectId);

    if (!isAdmin && !isCreator) {
      throw new BadRequestException('Only admins can update group');
    }

    Object.assign(group, updates);
    return group.save();
  }

  async deleteGroup(groupId: string, deletedBy: string): Promise<void> {
    const group = await this.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const deleterObjectId = new Types.ObjectId(deletedBy);

    // Only creator can delete group
    if (!group.createdBy.equals(deleterObjectId)) {
      throw new BadRequestException('Only group creator can delete the group');
    }

    await this.groupModel.findByIdAndDelete(groupId).exec();
  }
}
