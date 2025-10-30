import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: '/tmp',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(
            null,
            file.fieldname + '-' + uniqueSuffix + extname(file.originalname),
          );
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { from: string; to: string },
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    const fileUrl = `/tmp/${file.filename}`;
    const message = await this.messagesService.saveFile(
      body.from,
      body.to,
      fileUrl,
      file.originalname,
      file.size,
      file.mimetype,
    );

    return { message };
  }

  @Post('location')
  async sendLocation(
    @Body()
    body: {
      from: string;
      to: string;
      latitude: number;
      longitude: number;
      isLive?: boolean;
    },
  ) {
    const message = await this.messagesService.saveLocation(
      body.from,
      body.to,
      body.latitude,
      body.longitude,
      body.isLive || false,
    );
    return { message };
  }

  @Post('emoji')
  async sendEmoji(@Body() body: { from: string; to: string; emoji: string }) {
    const message = await this.messagesService.saveEmoji(
      body.from,
      body.to,
      body.emoji,
    );
    return { message };
  }

  @Post('gif')
  async sendGif(@Body() body: { from: string; to: string; gifUrl: string }) {
    const message = await this.messagesService.saveGif(
      body.from,
      body.to,
      body.gifUrl,
    );
    return { message };
  }

  @Post('sticker')
  async sendSticker(
    @Body() body: { from: string; to: string; stickerUrl: string },
  ) {
    const message = await this.messagesService.saveSticker(
      body.from,
      body.to,
      body.stickerUrl,
    );
    return { message };
  }

  @Post('webview')
  async sendWebView(
    @Body()
    body: {
      from: string;
      to: string;
      url: string;
      title?: string;
      description?: string;
      imageUrl?: string;
    },
  ) {
    const message = await this.messagesService.saveWebView(
      body.from,
      body.to,
      body.url,
      body.title,
      body.description,
      body.imageUrl,
    );
    return { message };
  }

  @Get('conversation')
  async getConversation(
    @Query('userA') userA: string,
    @Query('userB') userB: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;

    const messages = await this.messagesService.getConversation(
      userA,
      userB,
      limitNum,
      skipNum,
    );
    return { messages };
  }

  @Get('conversation/search')
  async searchConversation(
    @Query('userA') userA: string,
    @Query('userB') userB: string,
    @Query('query') query: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;

    const messages = await this.messagesService.searchConversation(
      userA,
      userB,
      query,
      limitNum,
      skipNum,
    );
    return { messages };
  }
}
