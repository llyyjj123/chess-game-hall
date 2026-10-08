/* ===============================================================
   js/games/go.js
   游戏 · 围棋
   自 index.html 第 2618-3321 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ===================================================================
//  GO (围棋)
// ===================================================================

class GoGame {
  constructor(canvas, ctx) {
    this.canvas = canvas; this.ctx = ctx;
    this.statusDotClass = 'white';
    this.undoLogCount = 1;
  }

  init() {
    this.boardSize = loadBoardSize(9);
    // 原先从未给 difficulty 赋值（undefined），而面板默认高亮「中等」——
    // 两者不一致，实际按最弱逻辑运行。这里补上并从偏好读取。
    this.difficulty = loadDifficulty('go', 1);
    this.board = Array.from({length: this.boardSize}, () => Array(this.boardSize).fill(0)); // 0 empty, 1 black, 2 white
    this.currentPlayer = 1; // black first
    this.moveHistory = [];
    this.koPoint = null;
    this.passCount = 0;
    this.gameOver = false;
    this.gameResult = '';
    this.aiThinking = false;
    this.lastMove = null;
    this.humanColor = 1; // player is black
    this.blackPrisoners = 0; // captured by black (white stones)
    this.whitePrisoners = 0; // captured by white (black stones)
    this.multiplayer = false;
    this.mySide = null;
    this.opponentSide = null;
    this._calcSizes();
    this.render();
    updateUI();
  }

  _calcSizes() {
    // Give Go more canvas real estate
    const avail = availableBoardSize(620, 660);
    const bs = this.boardSize;
    this.cellSize = Math.max(12, Math.floor(Math.min(avail.w / (bs + 0.5), avail.h / (bs + 0.5))));
    this.padX = this.cellSize;
    this.padY = this.cellSize;
    this.stoneR = Math.floor(this.cellSize * 0.46);
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
    const cs = this.cellSize, px = this.padX, py = this.padY, bs = this.boardSize;
    let br = -1, bc = -1, bd = Infinity;
    for (let r = 0; r < bs; r++) {
      for (let c = 0; c < bs; c++) {
        const dx = mx - (px + c * cs), dy = my - (py + r * cs);
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < bd && d < cs * 0.48) { bd = d; br = r; bc = c; }
      }
    }
    if (br < 0 || this.board[br][bc] !== 0) return;

    // Check ko
    if (this.koPoint && this.koPoint.row === br && this.koPoint.col === bc) return;

    // Check suicide
    if (this._isSuicide(br, bc, this.currentPlayer)) {
      updateUI();
      return;
    }

    this._placeStone(br, bc);
    this.currentPlayer = 3 - this.currentPlayer;
    if (this.multiplayer) {
      mp.sendMove({ row: br, col: bc });
    }
    updateUI();
    this.render();

    if (!this.multiplayer && !this.gameOver && this.currentPlayer !== this.humanColor) this._scheduleAI();
  }

  _isSuicide(r, c, player) {
    const sim = this.board.map(row => [...row]);
    sim[r][c] = player;
    const opp = 3 - player;
    // Check if this group has liberties after placement
    const hasLiberties = this._groupHasLiberty(sim, r, c, player);
    if (hasLiberties) return false;
    // Check if any adjacent opponent stones are captured (that gives liberties)
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
        if (sim[nr][nc] === opp) {
          if (!this._groupHasLiberty(sim, nr, nc, opp)) return false; // opponent group is captured
        }
      }
    }
    return true;
  }

  _groupHasLiberty(b, r, c, player) {
    const visited = new Set();
    const stack = [{r, c}];
    while (stack.length > 0) {
      const {r: cr, c: cc} = stack.pop();
      const key = cr * this.boardSize + cc;
      if (visited.has(key)) continue;
      visited.add(key);
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize) continue;
        if (b[nr][nc] === 0) return true; // Found liberty
        if (b[nr][nc] === player && !visited.has(nr * this.boardSize + nc)) {
          stack.push({r: nr, c: nc});
        }
      }
    }
    return false;
  }

  _placeStone(r, c) {
    const boardBefore = this.board.map(row => row.slice());
    const sim = this.board.map(row => [...row]);
    sim[r][c] = this.currentPlayer;
    const opp = 3 - this.currentPlayer;
    let captures = 0;

    // Remove captured opponent groups
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
        if (sim[nr][nc] === opp && !this._groupHasLiberty(sim, nr, nc, opp)) {
          captures += this._removeGroup(sim, nr, nc, opp);
        }
      }
    }

    // Set ko point if single capture
    this.koPoint = null;
    if (captures === 1) {
      // Check if the placed stone has only one liberty and captures 1 stone
      // Simplified ko: if this was a single-stone capture, that point is ko
      this.koPoint = { row: r, col: c };
    }

    // Actually this simplified ko is wrong. Let me do it properly:
    // After a capture, the capturing stone's point can be ko if the capturing move
    // was a single stone capturing a single stone.
    // Simpler approach: just set ko to the last captured stone's position
    if (captures === 1) {
      // Find the single captured stone
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
          if (sim[nr][nc] === 0) {
            const origPop = this.board[nr][nc];
            if (origPop === opp) {
              // This was the captured stone's position
              // Check if placing here would be ko (can't immediately recapture)
              // Simple ko: the ko point is where we just captured
              this.koPoint = { row: nr, col: nc };
              break;
            }
          }
        }
      }
    }

    this.board = sim;
    if (this.currentPlayer === 1) this.blackPrisoners += captures;
    else this.whitePrisoners += captures;
    this._updatePrisonerDisplay();

    this.lastMove = { row: r, col: c };
    this.moveHistory.push({ row: r, col: c, player: this.currentPlayer, boardBefore, koPoint: this.koPoint ? {...this.koPoint} : null });
    this.passCount = 0;

    const pieceCh = this.currentPlayer === 1 ? '●' : '○';
    const pieceClr = this.currentPlayer === 1 ? '#1a1a1a' : '#e8e8e8';
    currentRenderFn = () => this.render();
    const from = getBoardXY(r, c);
    animatePulse(from.x, from.y, 'rgba(255,200,80,0.9)', this.stoneR, 500);
    updateMoveLog(this.currentPlayer === 1 ? `● (${r+1},${c+1})` : `○ (${r+1},${c+1})`);
    this._soundAfterMove(this.currentPlayer, captures);
  }

  _removeGroup(b, r, c, player) {
    const visited = new Set();
    const stack = [{r, c}];
    let count = 0;
    while (stack.length > 0) {
      const {r: cr, c: cc} = stack.pop();
      const key = cr * this.boardSize + cc;
      if (visited.has(key)) continue;
      visited.add(key);
      b[cr][cc] = 0;
      count++;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && b[nr][nc] === player) {
          stack.push({r: nr, c: nc});
        }
      }
    }
    return count;
  }

  pass() {
    if (this.gameOver || this.aiThinking) return;
    if (this.multiplayer && this.currentPlayer !== (this.mySide === 'black' ? 1 : 2)) return;
    this.passCount++;
    updateMoveLog(this.currentPlayer === 1 ? '● 停着' : '○ 停着');

    if (this.passCount >= 2) {
      this._endGame();
      return;
    }

    this.currentPlayer = 3 - this.currentPlayer;
    if (this.multiplayer) {
      mp.sendPass();
    }
    updateUI();
    this.render();

    if (!this.multiplayer && !this.gameOver && this.currentPlayer !== this.humanColor) this._scheduleAI();
  }

  _endGame() {
    this.gameOver = true;
    // Count territory + prisoners
    let blackTerritory = this.blackPrisoners;
    let whiteTerritory = this.whitePrisoners;

    // Simple territory counting: flood fill from each empty point
    const visited = Array.from({length: this.boardSize}, () => Array(this.boardSize).fill(false));
    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        if (this.board[r][c] === 0 && !visited[r][c]) {
          const territory = this._floodFillTerritory(visited, r, c);
          if (territory.owner === 1) blackTerritory += territory.count;
          else if (territory.owner === 2) whiteTerritory += territory.count;
          // If owner === 0, it's neutral (dame)
        }
      }
    }

    // Komi: 6.5 points for white
    whiteTerritory += 6.5;

    if (blackTerritory > whiteTerritory) {
      this.gameResult = `黑胜 ${blackTerritory.toFixed(1)} vs ${whiteTerritory.toFixed(1)}`;
      this.statusDotClass = 'black';
    } else if (whiteTerritory > blackTerritory) {
      this.gameResult = `白胜 ${whiteTerritory.toFixed(1)} vs ${blackTerritory.toFixed(1)}`;
      this.statusDotClass = 'none';
    } else {
      this.gameResult = '平局！';
    }
    updateUI();
  }

  _floodFillTerritory(visited, startR, startC) {
    const stack = [{r: startR, c: startC}];
    let count = 0;
    let owner = 0; // 0 = none/neutral, 1 = black, 2 = white, 3 = both (dame)
    let foundBlack = false, foundWhite = false;

    while (stack.length > 0) {
      const {r, c} = stack.pop();
      if (visited[r][c]) continue;
      visited[r][c] = true;
      count++;

      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize) continue;
        if (this.board[nr][nc] === 0 && !visited[nr][nc]) {
          stack.push({r: nr, c: nc});
        } else if (this.board[nr][nc] === 1) {
          foundBlack = true;
        } else if (this.board[nr][nc] === 2) {
          foundWhite = true;
        }
      }
    }

    if (foundBlack && !foundWhite) owner = 1;
    else if (foundWhite && !foundBlack) owner = 2;
    else owner = 0; // both or neither (dame)

    return { count, owner };
  }

  // ── AI ──
  _getAIMove() {
    const player = 3 - this.humanColor;
    const bs = this.boardSize;

    // Collect candidate positions (near existing stones)
    const candidates = new Set();
    const positions = [];

    for (let r = 0; r < bs; r++) {
      for (let c = 0; c < bs; c++) {
        if (this.board[r][c] !== 0) {
          const range = this.difficulty >= 3 ? 3 : (this.difficulty >= 2 ? 2 : 1);
          for (let dr = -range; dr <= range; dr++) {
            for (let dc = -range; dc <= range; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < bs && nc >= 0 && nc < bs && this.board[nr][nc] === 0) {
                const key = nr * bs + nc;
                if (!candidates.has(key)) {
                  candidates.add(key);
                  positions.push({r: nr, c: nc});
                }
              }
            }
          }
        }
      }
    }

    if (positions.length === 0) {
      const center = Math.floor(bs / 2);
      return { row: center, col: center };
    }

    // Score each position
    let bestScore = -Infinity, bestMove = positions[0];
    for (const {r, c} of positions) {
      // Skip ko
      if (this.koPoint && this.koPoint.row === r && this.koPoint.col === c) continue;
      // Skip suicide
      if (this._isSuicide(r, c, player)) continue;

      let score = 0;

      // Basic territory influence
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < bs && nc >= 0 && nc < bs) {
          if (this.board[nr][nc] === player) score += 10;
          else if (this.board[nr][nc] === this.humanColor) score -= 5;
          else if (this.board[nr][nc] === 0) score += 2;
        }
      }

      // Center preference
      const cx = Math.floor(bs/2), cy = Math.floor(bs/2);
      score += (bs - Math.abs(r - cx) - Math.abs(c - cy)) * 0.5;

      // Capture bonus
      const sim = this.board.map(row => [...row]);
      sim[r][c] = player;
      let captures = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < bs && nc >= 0 && nc < bs) {
          if (sim[nr][nc] === this.humanColor && !this._groupHasLiberty(sim, nr, nc, this.humanColor)) {
            captures += this._countGroup(sim, nr, nc, this.humanColor);
          }
        }
      }
      score += captures * 20;

      // Higher difficulty: look at diagonal influence and connections
      if (this.difficulty >= 2) {
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < bs && nc >= 0 && nc < bs) {
            if (this.board[nr][nc] === player) score += 5;
            else if (this.board[nr][nc] === this.humanColor) score -= 3;
          }
        }
        // Liberty count for the group if we place here
        const libCount = this._countLiberties(sim, r, c, player);
        score += libCount * 3;
      }

      // Expert: evaluate connections, shape, and influence
      if (this.difficulty >= 3) {
        let connections = 0;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < bs && nc >= 0 && nc < bs && this.board[nr][nc] === player) {
            connections++;
          }
        }
        score += connections * 4;
        // Penalize isolated stones early
        if (this.moveHistory.length < 10 && connections === 0) score -= 15;

        // Distance-weighted influence from all stones on board
        let friendlyInfluence = 0, enemyInfluence = 0;
        for (let rr = 0; rr < bs; rr++) {
          for (let cc = 0; cc < bs; cc++) {
            if (this.board[rr][cc] === 0) continue;
            const dist = Math.abs(r - rr) + Math.abs(c - cc);
            if (dist === 0) continue;
            const influence = 1.0 / dist;
            if (this.board[rr][cc] === player) friendlyInfluence += influence;
            else enemyInfluence += influence;
          }
        }
        score += (friendlyInfluence - enemyInfluence) * 3;

        // 2-step lookahead: check if placing here leaves a group capturable
        const sim2 = this.board.map(row => [...row]);
        sim2[r][c] = player;
        for (const [dr2, dc2] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
          const nr2 = r + dr2, nc2 = c + dc2;
          if (nr2 >= 0 && nr2 < bs && nc2 >= 0 && nc2 < bs && sim2[nr2][nc2] === 0) {
            sim2[nr2][nc2] = this.humanColor;
            for (const [dr3, dc3] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nr3 = nr2 + dr3, nc3 = nc2 + dc3;
              if (nr3 >= 0 && nr3 < bs && nc3 >= 0 && nc3 < bs &&
                  sim2[nr3][nc3] === player &&
                  !this._groupHasLiberty(sim2, nr3, nc3, player)) {
                score -= this._countGroup(sim2, nr3, nc3, player) * 15;
              }
            }
            sim2[nr2][nc2] = 0;
          }
        }
      }

      // Add slight randomness (reduced for higher difficulty)
      score += Math.random() * (this.difficulty >= 2 ? 0.05 : 0.5);

      if (score > bestScore) {
        bestScore = score;
        bestMove = {r, c};
      }
    }

    return { row: bestMove.r, col: bestMove.c };
  }

  _countLiberties(b, r, c, player) {
    const visited = new Set();
    const stack = [{r, c}];
    let liberties = 0;
    while (stack.length > 0) {
      const {r: cr, c: cc} = stack.pop();
      const key = cr * this.boardSize + cc;
      if (visited.has(key)) continue;
      visited.add(key);
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize) continue;
        if (b[nr][nc] === 0) liberties++;
        else if (b[nr][nc] === player && !visited.has(nr * this.boardSize + nc)) {
          stack.push({r: nr, c: nc});
        }
      }
    }
    return liberties;
  }

  _countGroup(b, r, c, player) {
    const visited = new Set();
    const stack = [{r, c}];
    let count = 0;
    while (stack.length > 0) {
      const {r: cr, c: cc} = stack.pop();
      const key = cr * this.boardSize + cc;
      if (visited.has(key)) continue;
      visited.add(key);
      count++;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && b[nr][nc] === player) {
          stack.push({r: nr, c: nc});
        }
      }
    }
    return count;
  }

  _scheduleAI() {
    this.aiThinking = true;
    updateUI();

    setTimeout(() => {
      if (this.gameOver) { this.aiThinking = false; updateUI(); return; }
      const move = this._getAIMove();
      if (move.row >= 0 && !this._isSuicide(move.row, move.col, 3 - this.humanColor)) {
        this._placeStone(move.row, move.col);
      } else {
        this.passCount++;
        updateMoveLog(this.currentPlayer === 1 ? '● 停着' : '○ 停着');
        if (this.passCount >= 2) {
          this._endGame();
          updateUI();
        }
      }
      this.currentPlayer = this.humanColor;
      this.aiThinking = false;
      updateUI();
      this.render();
    }, 200 + Math.random() * 200);
  }

  newGame() {
    const bs = this.boardSize;
    this.board = Array.from({length: bs}, () => Array(bs).fill(0));
    this.currentPlayer = 1; this.moveHistory = []; this.koPoint = null;
    this.passCount = 0; this.gameOver = false; this.gameResult = '';
    this.aiThinking = false; this.lastMove = null;
    this.blackPrisoners = 0; this.whitePrisoners = 0;
    this.multiplayer = false; this.mySide = null; this.opponentSide = null;
    this.statusDotClass = 'white';
    currentRenderFn = () => this.render();
    this._updatePrisonerDisplay();
    this.render();
    updateUI();
  }

  undo() {
    if (this.gameOver || this.aiThinking || this.moveHistory.length < 2) return;
    for (let i = 0; i < 2; i++) {
      const entry = this.moveHistory.pop();
      this.board[entry.row][entry.col] = 0;
      this.koPoint = entry.koPoint;
    }
    this.lastMove = this.moveHistory.length > 0
      ? { row: this.moveHistory[this.moveHistory.length - 1].row, col: this.moveHistory[this.moveHistory.length - 1].col }
      : null;
    this.currentPlayer = this.humanColor;
    updateUI();
    this.render();
  }

  applyOpponentMove(data) {
    if (this.gameOver) return;
    if (data.row < 0 || data.row >= this.boardSize || data.col < 0 || data.col >= this.boardSize) return;
    if (this.board[data.row][data.col] !== 0) return;
    if (this.koPoint && this.koPoint.row === data.row && this.koPoint.col === data.col) return;
    const oppNum = this.mySide === 'black' ? 2 : 1;
    this.currentPlayer = oppNum;
    this._placeStone(data.row, data.col);
    this.render();
    updateUI();
  }

  applyOpponentPass() {
    if (this.gameOver) return;
    const oppNum = this.mySide === 'black' ? 2 : 1;
    this.currentPlayer = oppNum;
    this.passCount++;
    updateMoveLog(this.currentPlayer === 1 ? '● 停着' : '○ 停着');
    if (this.passCount >= 2) {
      this._endGame();
      return;
    }
    this.currentPlayer = this.mySide === 'black' ? 1 : 2;
    updateUI();
    this.render();
  }

  setBoardSize(size) {
    this.boardSize = size;
    this._calcSizes();
    this.newGame();
    updateSidePanel();
  }

  render() {
    const ctx = this.ctx, w = this.boardW, h = this.boardH, bs = this.boardSize;
    const T = themeColors();
    ctx.clearRect(0, 0, w, h);
    // 扁平棋盘：纯色底 + 1px 描边
    ctx.fillStyle = T.boardBg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const cs = this.cellSize, px = this.padX, py = this.padY;
    const tx = c => px + c * cs, ty = r => py + r * cs;

    // Grid
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < bs; i++) {
      ctx.moveTo(tx(0), ty(i)); ctx.lineTo(tx(bs - 1), ty(i));
      ctx.moveTo(tx(i), ty(0)); ctx.lineTo(tx(i), ty(bs - 1));
    }
    ctx.stroke();

    // Star points
    let stars;
    if (bs === 9) stars = [[2,2],[2,6],[4,4],[6,2],[6,6]];
    else if (bs === 13) stars = [[3,3],[3,6],[3,9],[6,3],[6,6],[6,9],[9,3],[9,6],[9,9]];
    else stars = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];

    for (const [r, c] of stars) {
      ctx.beginPath(); ctx.arc(tx(c), ty(r), cs * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = T.boardLine; ctx.fill();
    }

    // Ko point
    if (this.koPoint) {
      ctx.beginPath(); ctx.arc(tx(this.koPoint.col), ty(this.koPoint.row), this.stoneR * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,100,50,0.7)'; ctx.fill();
    }

    // Last move
    if (this.lastMove) {
      ctx.beginPath(); ctx.arc(tx(this.lastMove.col), ty(this.lastMove.row), this.stoneR + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.4)'; ctx.fill();
    }

    // Draw stones
    for (let r = 0; r < bs; r++) {
      for (let c = 0; c < bs; c++) {
        if (this.board[r][c] !== 0) this._drawStone(r, c, this.board[r][c]);
      }
    }
  }

// 围棋无「将军」，只在吃子时换音、终局播胜负音
  _soundAfterMove(justPlaced, captures) {
    const r = this.gameResult || '';
    const myNum = this.multiplayer ? (this.mySide === 'black' ? 1 : 2) : this.humanColor;
    const blackWon = r.indexOf('黑胜') >= 0;
    soundForMove({
      gameOver: this.gameOver,
      draw: r.indexOf('平局') >= 0,
      iWon: blackWon ? myNum === 1 : myNum === 2,
      captured: (captures || 0) > 0,
      check: false,
    });
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
      <div class="section-title">棋盘大小</div>
      <div class="size-group" id="goSizeGroup">
        ${sizeButtonsHTML(this.boardSize)}
      </div>
      <div class="section-title" style="margin-top:12px;">难度 · Difficulty</div>
      <div class="diff-group" id="goDiffGroup">
        ${diffButtonsHTML(this.difficulty)}
      </div></div>`;
  }

  bindPanelEvents() {
    const self = this;
    document.getElementById('goSizeGroup').addEventListener('click', function(e) {
      const btn = e.target.closest('.size-btn');
      if (!btn) return;
      this.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sz = parseInt(btn.dataset.size);
      saveBoardSize(sz);
      self.setBoardSize(sz);
    });
    document.getElementById('goDiffGroup').addEventListener('click', function(e) {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      this.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      self.difficulty = parseInt(btn.dataset.diff);
      saveDifficulty('go', self.difficulty);
      if (self.moveHistory.length > 0) self.newGame();
    });
  }

  getExtraActionsHTML() {
    return `<button class="small-btn" id="btnPass">停着 (Pass)</button>
      <div style="font-size:0.7em;color:var(--text-2);margin-top:4px;" id="goPrisonerInfo">
        提子: 黑${this.blackPrisoners} | 白${this.whitePrisoners}
      </div>`;
  }

  _updatePrisonerDisplay() {
    const el = document.getElementById('goPrisonerInfo');
    if (el) el.innerHTML = `提子: 黑${this.blackPrisoners} | 白${this.whitePrisoners}`;
  }

  getStatusText() {
    if (this.gameOver) return this.gameResult;
    if (this.aiThinking) return '电脑思考中…';
    if (this.multiplayer) {
      const isMyTurn = this.currentPlayer === (this.mySide === 'black' ? 1 : 2);
      const sideName = this.currentPlayer === 1 ? '黑方' : '白方';
      return `${sideName}落子${isMyTurn ? ' (你)' : ' (对手)'}`;
    }
    return this.currentPlayer === 1 ? '黑方落子' : '白方落子 (AI)';
  }
  getHintText() { return `点击交叉点落子 · 黑先 · 两次停着终局 · 白贴6.5目`; }
  getCapturedHTML() { return ''; }
  cleanup() {}
}

