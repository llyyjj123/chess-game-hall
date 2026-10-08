/* ===============================================================
   js/games/gomoku.js
   游戏 · 五子棋
   自 index.html 第 1264-1825 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ===================================================================
//  GOMOKU (五子棋)
// ===================================================================

const GK_SIZE = 19;
const GK_DIRS = [[1,0],[0,1],[1,1],[1,-1]];
const GK_DIRS8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

class GomokuGame {
  constructor(canvas, ctx) {
    this.canvas = canvas; this.ctx = ctx;
    this.statusDotClass = 'white';
    this.undoLogCount = 1;
  }

  init() {
    this.gkSize = 19;
    this.board = Array.from({length: this.gkSize}, () => Array(this.gkSize).fill(0));
    this.currentPlayer = 1;
    this.moveHistory = [];
    this.gameOver = false;
    this.gameResult = '';
    this.difficulty = loadDifficulty('gomoku', 2);
    this.aiThinking = false;
    this.lastMove = null;
    this.winningCells = [];
    this.multiplayer = false;
    this.mySide = null;
    this.opponentSide = null;
    this._calcSizes();
    this.render();
    updateUI();
    this.humanColor = 1;
  }

  _calcSizes() {
    const avail = availableBoardSize(620, 660);
    const bs = this.gkSize;
    this.cellSize = Math.max(12, Math.floor(Math.min(avail.w / (bs + 0.5), avail.h / (bs + 0.5))));
    this.padX = this.cellSize;
    this.padY = this.cellSize;
    this.stoneR = Math.floor(this.cellSize * 0.44);
    const bw = (bs - 1) * this.cellSize + this.padX * 2;
    const bh = (bs - 1) * this.cellSize + this.padY * 2;
    this.boardW = bw; this.boardH = bh;
    setupCanvas(bw, bh);
    const cs = this.cellSize, px = this.padX, py = this.padY;
    getBoardXY = (r, c) => ({ x: px + c * cs, y: py + r * cs });
  }

  handleClick(mx, my) {
    if (this.gameOver || this.aiThinking) return;
    if (this.multiplayer && this.currentPlayer !== (this.mySide === 'black' ? 1 : 2)) return;
    const cs = this.cellSize, px = this.padX, py = this.padY;
    // Find nearest grid point
    let br = -1, bc = -1, bd = Infinity;
    for (let r = 0; r < this.gkSize; r++) {
      for (let c = 0; c < this.gkSize; c++) {
        const dx = mx - (px + c * cs), dy = my - (py + r * cs);
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < bd && d < cs * 0.48) { bd = d; br = r; bc = c; }
      }
    }
    if (br < 0 || this.board[br][bc] !== 0) return;

    this._placeStone(br, bc, this.currentPlayer);
    if (this.multiplayer) {
      this.currentPlayer = 3 - this.currentPlayer;
      mp.sendMove({ row: br, col: bc });
    } else if (!this.gameOver && this.currentPlayer === this.humanColor) {
      this.currentPlayer = 3 - this.currentPlayer;
      this._scheduleAI();
    }
    updateUI();
    this.render();
  }

  _placeStone(r, c, player) {
    const boardBefore = this.board.map(row => row.slice());
    this.board[r][c] = player;
    this.lastMove = { row: r, col: c };
    this.moveHistory.push({ row: r, col: c, player, boardBefore });

    const pieceCh = player === 1 ? '●' : '○';
    const pieceClr = player === 1 ? '#1a1a1a' : '#e8e8e8';
    currentRenderFn = () => this.render();
    const from = getBoardXY(r, c);

    animatePulse(from.x, from.y, 'rgba(255,200,80,0.9)', this.stoneR, 500);
    updateMoveLog(player === 1 ? `● (${r+1},${c+1})` : `○ (${r+1},${c+1})`);

    this._checkWin(r, c, player);
    if (!this.gameOver && this._isBoardFull()) {
      this.gameOver = true;
      this.gameResult = '平局！棋盘已满';
    }
    this._soundAfterMove(player);
  }

  // 五子棋无吃子，只在终局播胜负音
  _soundAfterMove(player) {
    const r = this.gameResult || '';
    soundForMove({
      gameOver: this.gameOver,
      draw: r.indexOf('平局') >= 0,
      iWon: player === this.humanColor,
      captured: false,
      check: false,
    });
  }


  _isBoardFull() {
    for (let r = 0; r < this.gkSize; r++)
      for (let c = 0; c < this.gkSize; c++)
        if (this.board[r][c] === 0) return false;
    return true;
  }

  _checkWin(r, c, player) {
    for (let d = 0; d < 4; d++) {
      const dr = GK_DIRS[d][0], dc = GK_DIRS[d][1];
      let count = 1;
      const cells = [{ row: r, col: c }];
      // Forward
      for (let i = 1; i < 5; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr >= 0 && nr < this.gkSize && nc >= 0 && nc < this.gkSize && this.board[nr][nc] === player) {
          count++; cells.push({ row: nr, col: nc });
        } else break;
      }
      // Backward
      for (let i = 1; i < 5; i++) {
        const nr = r - dr * i, nc = c - dc * i;
        if (nr >= 0 && nr < this.gkSize && nc >= 0 && nc < this.gkSize && this.board[nr][nc] === player) {
          count++; cells.push({ row: nr, col: nc });
        } else break;
      }
      if (count >= 5) {
        this.gameOver = true;
        this.winningCells = cells;
        this.gameResult = player === this.humanColor ? '你赢了！五子连珠！' : 'AI获胜！五子连珠！';
        if (player === this.humanColor) this.statusDotClass = 'red';
        else this.statusDotClass = 'black';
        return;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  GOMOKU AI ENGINE - Threat Space Search + Iterative Deepening
  // ═══════════════════════════════════════════════════════

  _countLine(r, c, dr, dc, player, board, size) {
    let count = 0, i = 1;
    while (true) {
      const nr = r + dr * i, nc = c + dc * i;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size || board[nr][nc] !== player) break;
      count++; i++;
    }
    return count;
  }

  _getLineInfo(r, c, dr, dc, player, board, size) {
    const fwd = this._countLine(r, c, dr, dc, player, board, size);
    const bwd = this._countLine(r, c, -dr, -dc, player, board, size);
    const total = fwd + bwd + 1;
    const fR = r + dr * (fwd + 1), fC = c + dc * (fwd + 1);
    const bR = r - dr * (bwd + 1), bC = c - dc * (bwd + 1);
    const fOpen = fR >= 0 && fR < size && fC >= 0 && fC < size && board[fR][fC] === 0;
    const bOpen = bR >= 0 && bR < size && bC >= 0 && bC < size && board[bR][bC] === 0;
    return { total, openEnds: (fOpen ? 1 : 0) + (bOpen ? 1 : 0) };
  }

  _threatScore(r, c, player, board, size) {
    let score = 0;
    for (let d = 0; d < 4; d++) {
      const dr = GK_DIRS[d][0], dc = GK_DIRS[d][1];
      const { total, openEnds } = this._getLineInfo(r, c, dr, dc, player, board, size);
      if (total >= 5) score += 100000000;
      else if (total === 4) {
        if (openEnds === 2) score += 5000000;
        else if (openEnds === 1) score += 500000;
      } else if (total === 3) {
        if (openEnds === 2) score += 500000;
        else if (openEnds === 1) score += 50000;
      } else if (total === 2) {
        if (openEnds === 2) score += 50000;
        else if (openEnds === 1) score += 5000;
      } else if (total === 1) {
        score += openEnds === 2 ? 500 : 50;
      }
    }
    return score;
  }

  _evaluateBoard(board, aiPlayer, size) {
    const humanPlayer = 3 - aiPlayer;
    let aiScore = 0, humanScore = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board[r][c];
        if (cell === aiPlayer) aiScore += this._threatScore(r, c, aiPlayer, board, size);
        else if (cell === humanPlayer) humanScore += this._threatScore(r, c, humanPlayer, board, size);
      }
    }
    return aiScore - humanScore * 1.1;
  }

  _getCandidates(board, size, range) {
    const candidates = new Set();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] !== 0) {
          for (let dr = -range; dr <= range; dr++) {
            for (let dc = -range; dc <= range; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) {
                candidates.add(nr * size + nc);
              }
            }
          }
        }
      }
    }
    if (candidates.size === 0) return [{ row: Math.floor(size/2), col: Math.floor(size/2) }];
    return [...candidates].map(k => ({ row: Math.floor(k / size), col: k % size }));
  }

  _getOrderedMoves(board, aiPlayer, size, range, maxMoves) {
    const humanPlayer = 3 - aiPlayer;
    const candidates = this._getCandidates(board, size, range);
    const scored = candidates.map(m => {
      board[m.row][m.col] = aiPlayer;
      const aScore = this._threatScore(m.row, m.col, aiPlayer, board, size);
      board[m.row][m.col] = humanPlayer;
      const hScore = this._threatScore(m.row, m.col, humanPlayer, board, size);
      board[m.row][m.col] = 0;
      return { ...m, score: aScore + hScore * 0.95 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxMoves);
  }

  _minimax(board, depth, alpha, beta, isMax, aiPlayer, size, maxMoves, deadline) {
    if (depth === 0) return this._evaluateBoard(board, aiPlayer, size);
    // 每 64 个节点检查一次时间。
    // 原实现把 nodeCount 按值传递、每层只 +1，于是 (nodeCount & 63) === 0
    // 仅在「深度为 64 的倍数」时成立 —— 而深度上限只有 4，
    // 等于搜索中途的时间检查永远不会触发，3 秒预算形同虚设。
    this._nodes = (this._nodes || 0) + 1;
    if ((this._nodes & 63) === 0 && Date.now() > deadline) return this._evaluateBoard(board, aiPlayer, size);

    const humanPlayer = 3 - aiPlayer;
    const curPlayer = isMax ? aiPlayer : humanPlayer;
    const moves = this._getOrderedMoves(board, curPlayer, size, 2, maxMoves);
    if (moves.length === 0) return 0;

    if (isMax) {
      let best = -Infinity;
      for (const m of moves) {
        board[m.row][m.col] = aiPlayer;
        const val = this._minimax(board, depth - 1, alpha, beta, false, aiPlayer, size, maxMoves, deadline);
        board[m.row][m.col] = 0;
        best = Math.max(best, val);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        board[m.row][m.col] = humanPlayer;
        const val = this._minimax(board, depth - 1, alpha, beta, true, aiPlayer, size, maxMoves, deadline);
        board[m.row][m.col] = 0;
        best = Math.min(best, val);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  _openingBook(board, size) {
    const stones = board.flat().filter(x => x !== 0).length;
    if (stones === 0) return { row: Math.floor(size/2), col: Math.floor(size/2) };
    if (stones === 1) {
      const cx = Math.floor(size/2), cy = Math.floor(size/2);
      const offsets = [[1,1],[1,-1],[-1,1],[-1,-1],[0,1],[1,0],[0,-1],[-1,0]];
      for (const [dr, dc] of offsets) {
        const r = cx + dr, c = cy + dc;
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === 0) return { row: r, col: c };
      }
    }
    return null;
  }

  _getAIMove() {
    this._nodes = 0;
    const size = this.gkSize;
    const aiPlayer = 3 - this.humanColor;
    const humanPlayer = this.humanColor;
    const board = this.board;
    const startTime = Date.now();

    const candidates = this._getCandidates(board, size, 2);
    if (candidates.length === 0) return { row: Math.floor(size/2), col: Math.floor(size/2) };

    // Opening book
    const opening = this._openingBook(board, size);
    if (opening) return opening;

    // Immediate win
    for (const m of candidates) {
      board[m.row][m.col] = aiPlayer;
      for (let d = 0; d < 4; d++) {
        if (this._getLineInfo(m.row, m.col, GK_DIRS[d][0], GK_DIRS[d][1], aiPlayer, board, size).total >= 5) {
          board[m.row][m.col] = 0; return m;
        }
      }
      board[m.row][m.col] = 0;
    }

    // Block opponent win
    for (const m of candidates) {
      board[m.row][m.col] = humanPlayer;
      for (let d = 0; d < 4; d++) {
        if (this._getLineInfo(m.row, m.col, GK_DIRS[d][0], GK_DIRS[d][1], humanPlayer, board, size).total >= 5) {
          board[m.row][m.col] = 0; return m;
        }
      }
      board[m.row][m.col] = 0;
    }

    // Block open-four
    for (const m of candidates) {
      board[m.row][m.col] = humanPlayer;
      for (let d = 0; d < 4; d++) {
        const info = this._getLineInfo(m.row, m.col, GK_DIRS[d][0], GK_DIRS[d][1], humanPlayer, board, size);
        if (info.total === 4 && info.openEnds === 2) {
          board[m.row][m.col] = 0; return m;
        }
      }
      board[m.row][m.col] = 0;
    }

    // Create open-four
    for (const m of candidates) {
      board[m.row][m.col] = aiPlayer;
      for (let d = 0; d < 4; d++) {
        const info = this._getLineInfo(m.row, m.col, GK_DIRS[d][0], GK_DIRS[d][1], aiPlayer, board, size);
        if (info.total === 4 && info.openEnds === 2) {
          board[m.row][m.col] = 0; return m;
        }
      }
      board[m.row][m.col] = 0;
    }

    // Iterative deepening with time limit
    const timeLimits = [200, 500, 1200, 3000];
    const maxMovesList = [6, 10, 12, 16];
    const timeLimit = timeLimits[this.difficulty] || 300;
    const deadline = startTime + timeLimit;
    const maxMoves = maxMovesList[this.difficulty] || 10;

    let bestMove = candidates[0];
    let bestScore = -Infinity;
    let prevBest = null;

    for (let depth = 1; depth <= (this.difficulty >= 2 ? 4 : 2); depth++) {
      if (Date.now() > deadline) break;

      const moves = this._getOrderedMoves(board, aiPlayer, size, 2, maxMoves);
      // 上一层的最佳着法排到首位，提高 α-β 剪枝率。
      // 注意 _getOrderedMoves 返回的是新对象，只能按坐标匹配。
      if (prevBest) {
        const i = moves.findIndex(m => m.row === prevBest.row && m.col === prevBest.col);
        if (i > 0) { const [x] = moves.splice(i, 1); moves.unshift(x); }
      }
      let currentBest = moves[0];
      let currentScore = -Infinity;

      for (const m of moves) {
        if (Date.now() > deadline) break;
        board[m.row][m.col] = aiPlayer;
        const score = this._minimax(board, depth - 1, -Infinity, Infinity, false, aiPlayer, size, maxMoves, deadline);
        board[m.row][m.col] = 0;

        if (score > currentScore) {
          currentScore = score;
          currentBest = m;
        }
      }

      if (currentScore > bestScore || depth <= 2) {
        bestScore = currentScore;
        bestMove = currentBest;
      }
      prevBest = currentBest;
    }

    return bestMove;
  }

  _scheduleAI() {
    this.aiThinking = true;
    updateUI();

    const delay = this.difficulty >= 2 ? 300 : 150;
    setTimeout(() => {
      if (this.gameOver) { this.aiThinking = false; updateUI(); return; }
      const move = this._getAIMove();
      if (move.row >= 0) {
        this._placeStone(move.row, move.col, 3 - this.humanColor);
        this.currentPlayer = this.humanColor;
      }
      this.aiThinking = false;
      updateUI();
      this.render();
    }, delay + Math.random() * 100);
  }

  applyOpponentMove(data) {
    if (this.gameOver) return;
    if (data.row < 0 || data.row >= this.gkSize || data.col < 0 || data.col >= this.gkSize) return;
    if (this.board[data.row][data.col] !== 0) return;
    const oppSide = this.mySide === 'black' ? 2 : 1;
    this._placeStone(data.row, data.col, oppSide);
    this.currentPlayer = this.mySide === 'black' ? 1 : 2;
    this.render();
    updateUI();
  }

  newGame() {
    this.board = Array.from({length: this.gkSize}, () => Array(this.gkSize).fill(0));
    this.currentPlayer = 1; this.moveHistory = []; this.gameOver = false; this.gameResult = '';
    this.aiThinking = false; this.lastMove = null; this.winningCells = []; this.statusDotClass = 'white';
    this.multiplayer = false; this.mySide = null; this.opponentSide = null;
    currentRenderFn = () => this.render();
    this.render();
    updateUI();
  }

  undo() {
    if (this.gameOver || this.aiThinking || this.moveHistory.length < 2) return;
    // Undo AI move + player move
    for (let i = 0; i < 2; i++) {
      const entry = this.moveHistory.pop();
      this.board[entry.row][entry.col] = 0;
    }
    this.lastMove = this.moveHistory.length > 0
      ? { row: this.moveHistory[this.moveHistory.length - 1].row, col: this.moveHistory[this.moveHistory.length - 1].col }
      : null;
    this.currentPlayer = this.humanColor;
    updateUI();
    this.render();
  }

  render() {
    const ctx = this.ctx, w = this.boardW, h = this.boardH;
    const T = themeColors();
    ctx.clearRect(0, 0, w, h);
    // 扁平棋盘：纯色底 + 1px 描边，去掉渐变与粗边框
    ctx.fillStyle = T.boardBg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const cs = this.cellSize, px = this.padX, py = this.padY;
    const tx = c => px + c * cs, ty = r => py + r * cs;

    // Grid
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < this.gkSize; i++) {
      ctx.moveTo(tx(0), ty(i)); ctx.lineTo(tx(this.gkSize - 1), ty(i));
      ctx.moveTo(tx(i), ty(0)); ctx.lineTo(tx(i), ty(this.gkSize - 1));
    }
    ctx.stroke();

    // Star points (dynamic based on board size)
    const stars = this._getStarPoints(this.gkSize);
    for (const [r, c] of stars) {
      ctx.beginPath(); ctx.arc(tx(c), ty(r), cs * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = T.boardLine; ctx.fill();
    }

    // Winning cells
    for (const cell of this.winningCells) {
      ctx.beginPath(); ctx.arc(tx(cell.col), ty(cell.row), this.stoneR + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,50,50,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.arc(tx(cell.col), ty(cell.row), this.stoneR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,50,50,0.7)'; ctx.lineWidth = 2;
      ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Last move marker
    if (this.lastMove && this.winningCells.length === 0) {
      ctx.beginPath(); ctx.arc(tx(this.lastMove.col), ty(this.lastMove.row), this.stoneR + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.4)'; ctx.fill();
    }

    // Draw stones
    for (let r = 0; r < this.gkSize; r++) {
      for (let c = 0; c < this.gkSize; c++) {
        if (this.board[r][c] !== 0) this._drawStone(r, c, this.board[r][c]);
      }
    }
  }

  _getStarPoints(size) {
    if (size < 9) return [];
    const edges = [3, Math.floor(size / 2), size - 4];
    const pts = [];
    for (const r of edges) { for (const c of edges) { pts.push([r, c]); } }
    return pts;
  }

  _drawStone(row, col, player) {
    const ctx = this.ctx, x = this.padX + col * this.cellSize, y = this.padY + row * this.cellSize;
    const r = this.stoneR;
    // 扁平棋子：实心 + 细描边，去掉投影与径向渐变
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = player === 1 ? '#1f1f1f' : '#fbfbf8'; ctx.fill();
    ctx.strokeStyle = player === 1 ? '#000' : 'rgba(0,0,0,.22)';
    ctx.lineWidth = 1; ctx.stroke();
  }

  // ── 复盘浏览 ──
  // 进入复盘时把实时局面存起来，临时把 this.board 指向历史局面渲染；
  // 期间棋盘点击被禁用（见 events.js），退出时还原。
  get reviewing() { return !!this._reviewLive; }

  enterReview() {
    if (this._reviewLive) return;
    this._reviewLive = { board: this.board, turn: this.currentTurn };
    this.setReviewPly(this.moveHistory.length);
  }

  setReviewPly(k) {
    if (!this._reviewLive) return;
    const n = Math.max(0, Math.min(k, this.moveHistory.length));
    this._reviewPly = n;
    this.board = (n < this.moveHistory.length && this.moveHistory[n].boardBefore)
      ? this.moveHistory[n].boardBefore
      : this._reviewLive.board;
    this.render();
  }

  exitReview() {
    if (!this._reviewLive) return;
    this.board = this._reviewLive.board;
    this.currentTurn = this._reviewLive.turn;
    this._reviewLive = null;
    this._reviewPly = null;
    this.render();
    updateUI();
  }

  // 认输：单机与联机通用。联机时通知对手
  resign() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.gameResult = this.multiplayer ? '你认输了' : '你认输了 · 电脑获胜';
    this.statusDotClass = 'none';
    Sound.lose();
    if (this.multiplayer) mp.sendResign();
    this.render();
    updateUI();
  }

  getPanelHTML() {
    return `<div>
      <div class="section-title">难度 · Difficulty</div>
      <div class="diff-group" id="gkDiffGroup">
        ${diffButtonsHTML(this.difficulty)}
      </div></div>`;
  }

  bindPanelEvents() {
    const self = this;
    document.getElementById('gkDiffGroup').addEventListener('click', function(e) {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      this.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      self.difficulty = parseInt(btn.dataset.diff);
      saveDifficulty('gomoku', self.difficulty);
      if (self.moveHistory.length > 0) self.newGame();
    });
  }

  getStatusText() {
    if (this.gameOver) return this.gameResult;
    if (this.aiThinking) return '电脑思考中…';
    if (this.multiplayer) {
      const isMyTurn = this.currentPlayer === (this.mySide === 'black' ? 1 : 2);
      const sideName = this.currentPlayer === 1 ? '黑方' : '白方';
      return `${sideName}落子${isMyTurn ? ' (你)' : ' (对手)'}`;
    }
    return this.currentPlayer === 1 ? '黑方落子 (你)' : '白方落子 (AI)';
  }
  getHintText() { return '点击交叉点落子 · 黑先 · 五子连珠胜'; }
  getCapturedHTML() { return ''; }
  getWinnerSide() {
    if (!this.gameOver) return null;
    if (this.gameResult.includes('你赢')) return this.mySide;
    if (this.gameResult.includes('AI获胜') || this.gameResult.includes('对手')) return this.mySide === 'black' ? 'white' : 'black';
    return null;
  }
  cleanup() {}
}

