import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

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
}
