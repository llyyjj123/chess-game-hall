const express = require('express');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const SYSTEM_PROMPTS = {
  'chinese-chess': `你是一个中国象棋AI大师。你将收到一个10行9列的棋盘状态，棋子用以下字符表示：
红方：帅(K) 仕(A) 相(B) 馬(H) 車(R) 炮(C) 兵(P)
黑方：将(k) 士(a) 象(b) 馬(h) 車(r) 砲(c) 卒(p)
空位用"."表示。棋盘从上到下是第0-9行（黑方在上，红方在下），从左到右是第0-8列。

你需要分析局面并选择最佳走法。返回格式为JSON：{"from":[行,列],"to":[行,列]}

注意：
- 红方在下方（第7-9行），黑方在上方（第0-3行）
- 你需要为红方（下方）走棋
- 只返回JSON，不要其他文字`,

  'gomoku': `你是一个五子棋AI大师。你将收到一个15x15的棋盘，用以下表示：
- 0 = 空位
- 1 = 黑子（人类玩家）
- 2 = 白子（你，AI）

你需要分析局面并选择最佳位置落子。返回格式为JSON：{"row":行号,"col":列号}

注意：
- 行和列从0开始计数
- 你需要为白方（AI）落子
- 只返回JSON，不要其他文字`,

  'chess': `你是一个国际象棋AI大师。你将收到FEN格式的棋盘状态。

你需要分析局面并选择最佳走法。返回格式为JSON：{"from":"代数坐标","to":"代数坐标"}
例如：{"from":"e2","to":"e4"}

注意：
- 使用标准代数坐标（a1-h8）
- 你需要为黑方走棋（FEN中轮到b走）
- 只返回JSON，不要其他文字`,

  'go': `你是一个围棋AI大师。你将收到一个NxN的棋盘，用以下表示：
- 0 = 空位
- 1 = 黑子（人类玩家）
- 2 = 白子（你，AI）

你需要分析局面并选择最佳位置落子。返回格式为JSON：{"row":行号,"col":列号}
如果应该停着（pass），返回：{"pass":true}

注意：
- 行和列从0开始计数
- 你需要为白方（AI）落子
- 注意劫的规则
- 只返回JSON，不要其他文字`
};

function formatBoardChineseChess(board) {
  const chars = {
    red: ['帅','仕','相','馬','車','炮','兵'],
    black: ['将','士','象','馬','車','砲','卒']
  };
  return board.map((row, r) =>
    row.map((piece, c) => {
      if (!piece) return '.';
      if (piece.side === 0) return chars.red[piece.type];
      return chars.black[piece.type];
    }).join('')
  ).join('\n');
}

function formatBoardGomoku(board) {
  return board.map(row => row.join('')).join('\n');
}

function boardToFEN(board, currentTurn, castlingRights, enPassant) {
  const pieceMap = {
    0: { 0: 'P', 1: 'N', 2: 'B', 3: 'R', 4: 'Q', 5: 'K' },
    1: { 0: 'p', 1: 'n', 2: 'b', 3: 'r', 4: 'q', 5: 'k' }
  };
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) { empty++; }
      else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += pieceMap[p.side][p.type];
      }
    }
    if (empty > 0) fen += empty;
    if (r < 7) fen += '/';
  }
  fen += currentTurn === 0 ? ' w ' : ' b ';
  let castle = '';
  if (castlingRights) {
    if (castlingRights.wK) castle += 'K';
    if (castlingRights.wQ) castle += 'Q';
    if (castlingRights.bK) castle += 'k';
    if (castlingRights.bQ) castle += 'q';
  }
  fen += castle || '-';
  fen += enPassant ? ` ${String.fromCharCode(97 + enPassant.col)}${8 - enPassant.row}` : ' -';
  fen += ' 0 1';
  return fen;
}

function formatBoardGo(board) {
  return board.map(row => row.join('')).join('\n');
}

app.post('/api/move', async (req, res) => {
  try {
    const { gameType, board, currentTurn, castlingRights, enPassant, boardSize } = req.body;

    if (!gameType || !board || !SYSTEM_PROMPTS[gameType]) {
      return res.status(400).json({ error: 'Invalid game type' });
    }

    let boardStr;
    switch (gameType) {
      case 'chinese-chess':
        boardStr = formatBoardChineseChess(board);
        break;
      case 'gomoku':
        boardStr = formatBoardGomoku(board);
        break;
      case 'chess':
        boardStr = boardToFEN(board, currentTurn, castlingRights, enPassant);
        break;
      case 'go':
        boardStr = formatBoardGo(board);
        break;
    }

    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[gameType] },
        { role: 'user', content: `当前棋盘状态：\n${boardStr}\n\n请分析并返回最佳走法。` }
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    const content = completion.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid AI response', raw: content });
    }

    const move = JSON.parse(jsonMatch[0]);
    res.json({ move });
  } catch (err) {
    console.error('AI move error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
