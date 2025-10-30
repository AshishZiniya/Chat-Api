import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async createGroup(
    @Body() body: { name: string; description?: string; members?: string[] },
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    return this.groupsService.createGroup(
      body.name,
      body.description || '',
      userId,
      body.members,
    );
  }

  @Get()
  async getUserGroups(@Request() req: any) {
    const userId = req.user.userId;
    return this.groupsService.getUserGroups(userId);
  }

  @Get(':id')
  async getGroup(@Param('id') id: string) {
    return this.groupsService.findById(id);
  }

  @Put(':id/members')
  async addMember(
    @Param('id') groupId: string,
    @Body() body: { userId: string },
    @Request() req: any,
  ) {
    const addedBy = req.user.userId;
    return this.groupsService.addMember(groupId, body.userId, addedBy);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') groupId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    const removedBy = req.user.userId;
    return this.groupsService.removeMember(groupId, userId, removedBy);
  }

  @Put(':id')
  async updateGroup(
    @Param('id') groupId: string,
    @Body() updates: { name?: string; description?: string; avatar?: string },
    @Request() req: any,
  ) {
    const updatedBy = req.user.userId;
    return this.groupsService.updateGroup(groupId, updates, updatedBy);
  }

  @Delete(':id')
  async deleteGroup(@Param('id') groupId: string, @Request() req: any) {
    const deletedBy = req.user.userId;
    await this.groupsService.deleteGroup(groupId, deletedBy);
    return { message: 'Group deleted successfully' };
  }
}
