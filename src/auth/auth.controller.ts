import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.auth.login(body.username, body.password);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  async register(
    @Body() body: { username: string; password: string; avatar?: string },
  ) {
    return this.auth.register(body.username, body.password, body.avatar);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refreshToken(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() body: { userId: string }) {
    return this.auth.logout(body.userId);
  }
}
