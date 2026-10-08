/* ===============================================================
   js/games/chinese-chess.js
   游戏 · 中国象棋
   自 index.html 第 688-1263 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ===================================================================
// ═══════════════════════════════════════════════════════
//  CHINESE CHESS (象棋)
// ═══════════════════════════════════════════════════════

const RED = 0, BLACK = 1;
const CC_KING = 0, CC_ADVISOR = 1, CC_ELEPHANT = 2, CC_HORSE = 3, CC_ROOK = 4, CC_CANNON = 5, CC_PAWN = 6;
const PIECE_NAMES_RED = ['帅','仕','相','馬','車','炮','兵'];
const PIECE_NAMES_BLACK = ['将','士','象','馬','車','砲','卒'];
const PIECE_WORDS_RED = ['帅','仕','相','马','车','炮','兵'];
const PIECE_WORDS_BLACK = ['将','士','象','马','车','炮','卒'];
const CC_VALUES = [10000, 200, 200, 400, 900, 450, 100];
const CC_PAWN_CROSSED = 200;

const ROOK_BONUS = [[14,14,14,14,14,14,14,14,14],[16,20,18,24,24,24,18,20,16],[10,12,14,16,16,16,14,12,10],[8,10,10,12,12,12,10,10,8],[6,8,8,10,10,10,8,8,6],[4,6,6,8,8,8,6,6,4],[2,4,4,6,6,6,4,4,2],[2,4,4,6,6,6,4,4,2],[0,2,2,4,4,4,2,2,0],[-2,0,0,2,2,2,0,0,-2]];
const HORSE_BONUS = [[0,-2,0,0,0,0,0,-2,0],[0,2,4,4,2,4,4,2,0],[2,4,8,6,8,6,8,4,2],[2,6,6,8,10,8,6,6,2],[0,4,8,10,12,10,8,4,0],[0,4,6,10,12,10,6,4,0],[-2,2,4,8,8,8,4,2,-2],[0,-2,2,4,4,4,2,-2,0],[0,0,-2,2,2,2,-2,0,0],[-4,0,0,0,0,0,0,0,-4]];
const CANNON_BONUS = [[0,0,2,4,4,4,2,0,0],[0,2,4,4,6,4,4,2,0],[2,4,6,6,8,6,6,4,2],[2,4,6,6,8,6,6,4,2],[0,2,4,6,6,6,4,2,0],[0,2,4,4,6,4,4,2,0],[-2,0,2,2,4,2,2,0,-2],[0,0,0,2,2,2,0,0,0],[0,0,-2,0,2,0,-2,0,0],[0,0,0,-2,0,-2,0,0,0]];
const PAWN_BONUS = [[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,-2,0,4,0,-2,0,0],[2,0,4,0,6,0,4,0,2],[6,10,14,16,20,16,14,10,6],[10,16,22,26,30,26,22,16,10],[14,22,28,34,40,34,28,22,14],[18,28,36,40,46,40,36,28,18],[18,34,44,50,56,50,44,34,18]];

function ccPieceChar(type, side, useWord=false) {
  return side === RED ? (useWord ? PIECE_WORDS_RED : PIECE_NAMES_RED)[type]
                      : (useWord ? PIECE_WORDS_BLACK : PIECE_NAMES_BLACK)[type];
}

class ChineseChessGame {
  constructor(canvas, ctx) {
    this.canvas = canvas; this.ctx = ctx;
    this.statusDotClass = 'red';
    this.undoLogCount = 2;
  }

  init() {
    this.board = this._createBoard();
    this.currentTurn = RED;
    this.selectedPiece = null;
    this.validMoves = [];
    this.moveHistory = [];
    this._posKeys = [];
    this.capturedByRed = [];
    this.capturedByBlack = [];
    this.gameOver = false;
    this.gameResult = '';
    this.difficulty = loadDifficulty('chinese-chess', 1);
    this.aiThinking = false;
    this.lastMove = null;
    this.multiplayer = false;
    this.mySide = null;
    this.opponentSide = null;
    this._calcSizes();
    this.render();
    updateUI();
  }

  _calcSizes() {
    const avail = availableBoardSize(540, 600);
    const COLS = 9, ROWS = 10;
    this.cellSize = Math.max(16, Math.floor(Math.min(avail.w / (COLS + 1), avail.h / (ROWS + 1))));
    this.padX = Math.floor(this.cellSize * 0.8);
    this.padY = Math.floor(this.cellSize * 0.8);
    this.pieceR = Math.floor(this.cellSize * 0.42);
    const bw = (COLS - 1) * this.cellSize + this.padX * 2;
    const bh = (ROWS - 1) * this.cellSize + this.padY * 2;
    this.boardW = bw; this.boardH = bh;
    setupCanvas(bw, bh);
    const cs = this.cellSize, px = this.padX, py = this.padY;
    const flip = this.multiplayer && this.mySide === 'black';
    getBoardXY = (r, c) => ({ x: px + (flip ? 8 - c : c) * cs, y: py + (flip ? 9 - r : r) * cs });
  }

  _createBoard() {
    const b = Array.from({length:10},()=>Array(9).fill(null));
    const p = (r,c,t,s) => { b[r][c]={type:t,side:s}; };
    p(0,0,CC_ROOK,BLACK);p(0,1,CC_HORSE,BLACK);p(0,2,CC_ELEPHANT,BLACK);p(0,3,CC_ADVISOR,BLACK);
    p(0,4,CC_KING,BLACK);p(0,5,CC_ADVISOR,BLACK);p(0,6,CC_ELEPHANT,BLACK);p(0,7,CC_HORSE,BLACK);p(0,8,CC_ROOK,BLACK);
    p(2,1,CC_CANNON,BLACK);p(2,7,CC_CANNON,BLACK);
    p(3,0,CC_PAWN,BLACK);p(3,2,CC_PAWN,BLACK);p(3,4,CC_PAWN,BLACK);p(3,6,CC_PAWN,BLACK);p(3,8,CC_PAWN,BLACK);
    p(9,0,CC_ROOK,RED);p(9,1,CC_HORSE,RED);p(9,2,CC_ELEPHANT,RED);p(9,3,CC_ADVISOR,RED);
    p(9,4,CC_KING,RED);p(9,5,CC_ADVISOR,RED);p(9,6,CC_ELEPHANT,RED);p(9,7,CC_HORSE,RED);p(9,8,CC_ROOK,RED);
    p(7,1,CC_CANNON,RED);p(7,7,CC_CANNON,RED);
    p(6,0,CC_PAWN,RED);p(6,2,CC_PAWN,RED);p(6,4,CC_PAWN,RED);p(6,6,CC_PAWN,RED);p(6,8,CC_PAWN,RED);
    return b;
  }

  _cloneBoard(b) { return b.map(r=>r.map(c=>c?{...c}:null)); }
  _findKing(b, side) {
    for(let r=0;r<10;r++)for(let c=0;c<9;c++){const p=b[r][c];if(p&&p.type===CC_KING&&p.side===side)return{row:r,col:c};}
    return null;
  }
  _inPalace(r,c,side) { return side===RED?r>=7&&r<=9&&c>=3&&c<=5:r>=0&&r<=2&&c>=3&&c<=5; }
  _inBounds(r,c) { return r>=0&&r<10&&c>=0&&c<9; }
  _crossedRiver(r,side) { return side===RED?r<=4:r>=5; }

  _getRawMoves(b, row, col) {
    const piece = b[row][col];
    if(!piece)return[];
    const moves=[], side=piece.side, opp=1-side;
    const addMove=(tr,tc)=>{
      if(!this._inBounds(tr,tc))return;
      if(b[tr][tc]&&b[tr][tc].side===side)return;
      moves.push({fromRow:row,fromCol:col,toRow:tr,toCol:tc});
    };
    const slide=(dr,dc)=>{
      for(let i=1;i<10;i++){const tr=row+dr*i,tc=col+dc*i;if(!this._inBounds(tr,tc))break;const t=b[tr][tc];if(t){if(t.side===opp)addMove(tr,tc);break;}addMove(tr,tc);}
    };
    switch(piece.type){
      case CC_KING:
        for(const[d,r]of[[-1,0],[1,0],[0,-1],[0,1]]){const tr=row+d,tc=col+r;if(this._inPalace(tr,tc,side))addMove(tr,tc);}break;
      case CC_ADVISOR:
        for(const[d,r]of[[-1,-1],[-1,1],[1,-1],[1,1]]){const tr=row+d,tc=col+r;if(this._inPalace(tr,tc,side))addMove(tr,tc);}break;
      case CC_ELEPHANT:
        for(const[d,r,e,f]of[[-2,-2,-1,-1],[-2,2,-1,1],[2,-2,1,-1],[2,2,1,1]]){
          const tr=row+d,tc=col+r;if(!this._inBounds(tr,tc))continue;
          if(side===RED?tr<5:tr>4)continue;
          if(b[row+e][col+f])continue;
          addMove(tr,tc);
        }break;
      case CC_HORSE:
        for(const[d,r,e,f]of[[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1]]){
          const tr=row+d,tc=col+r;if(!this._inBounds(tr,tc))continue;
          if(b[row+e][col+f])continue;
          addMove(tr,tc);
        }break;
      case CC_ROOK:for(const[d,r]of[[-1,0],[1,0],[0,-1],[0,1]])slide(d,r);break;
      case CC_CANNON:
        for(const[d,r]of[[-1,0],[1,0],[0,-1],[0,1]]){
          let jumped=false;
          for(let i=1;i<10;i++){const tr=row+d*i,tc=col+r*i;if(!this._inBounds(tr,tc))break;const t=b[tr][tc];if(!jumped){if(t){jumped=true;}else addMove(tr,tc);}else{if(t){if(t.side===opp)addMove(tr,tc);break;}}}
        }break;
      case CC_PAWN:
        const fwd=side===RED?-1:1;addMove(row+fwd,col);
        if(this._crossedRiver(row,side)){addMove(row,col-1);addMove(row,col+1);}break;
    }
    return moves;
  }

  _kingsFacing(b) {
    const rk=this._findKing(b,RED),bk=this._findKing(b,BLACK);
    if(!rk||!bk)return false;
    if(rk.col!==bk.col)return false;
    for(let r=Math.min(rk.row,bk.row)+1;r<Math.max(rk.row,bk.row);r++){if(b[r][rk.col])return false;}
    return true;
  }

  // 从将/帅向外扫描判断是否被将。
  // 原实现是「扫描全部 90 格 → 为每个敌子生成走法 → 看能否吃到将」，
  // 每次 _getLegalMoves 要对每个候选走法调一次，实测 2.066µs/次、
  // 并连带触发 16 次 _getRawMoves。改为外向扫描后计算量与棋盘大小无关。
  _isInCheck(b, side) {
    const kp = this._findKing(b, side);
    if (!kp) return true;
    const kr = kp.row, kc = kp.col, opp = 1 - side;

    // ── 车 / 炮：沿 4 条直线向外 ──
    // 第一个碰到的子若是敌车 → 将军；越过它（炮架）后碰到的第一个子若是敌炮 → 将军
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let screened = false;
      for (let i = 1; i < 10; i++) {
        const r = kr + dr * i, c = kc + dc * i;
        if (!this._inBounds(r, c)) break;
        const p = b[r][c];
        if (!p) continue;
        if (!screened) {
          if (p.side === opp && p.type === CC_ROOK) return true;
          screened = true;
        } else {
          if (p.side === opp && p.type === CC_CANNON) return true;
          break;
        }
      }
    }

    // ── 马：由 4 个对角反推「马腿」与两个可能的马位 ──
    // 马腿恒为将/帅的斜邻格；腿空时，(2dr,dc) 与 (dr,2dc) 两处若有敌马则将军
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const lr = kr + dr, lc = kc + dc;
      if (!this._inBounds(lr, lc) || b[lr][lc]) continue;
      const h1r = kr + 2 * dr, h1c = kc + dc;
      if (this._inBounds(h1r, h1c)) {
        const p = b[h1r][h1c];
        if (p && p.side === opp && p.type === CC_HORSE) return true;
      }
      const h2r = kr + dr, h2c = kc + 2 * dc;
      if (this._inBounds(h2r, h2c)) {
        const p = b[h2r][h2c];
        if (p && p.side === opp && p.type === CC_HORSE) return true;
      }
    }

    // ── 兵 / 卒 ──
    // 正向：敌兵在「将的前一格反向」处即可攻击；过河后还可横向攻击
    const fwd = opp === RED ? -1 : 1;
    const pr = kr - fwd;
    if (this._inBounds(pr, kc)) {
      const p = b[pr][kc];
      if (p && p.side === opp && p.type === CC_PAWN) return true;
    }
    if (this._crossedRiver(kr, opp)) {
      for (const dc of [-1, 1]) {
        const c = kc + dc;
        if (!this._inBounds(kr, c)) continue;
        const p = b[kr][c];
        if (p && p.side === opp && p.type === CC_PAWN) return true;
      }
    }

    // 士/象 走不出己方九宫与半场，将帅照面由 _kingsFacing 单独判定
    return false;
  }

  _getLegalMoves(b, row, col) {
    const piece=b[row][col];if(!piece)return[];
    const raw=this._getRawMoves(b,row,col),legal=[];
    for(const m of raw){
      const sim=this._cloneBoard(b);
      sim[m.toRow][m.toCol]=sim[m.fromRow][m.fromCol];sim[m.fromRow][m.fromCol]=null;
      if(this._isInCheck(sim,piece.side))continue;
      if(this._kingsFacing(sim))continue;
      legal.push(m);
    }
    return legal;
  }

  _allLegalMoves(b, side) {
    const all=[];
    for(let r=0;r<10;r++)for(let c=0;c<9;c++){if(b[r][c]&&b[r][c].side===side){for(const m of this._getLegalMoves(b,r,c))all.push(m);}}
    return all;
  }

  _makeMove(b, m) {
    const nb=this._cloneBoard(b);
    const cap=nb[m.toRow][m.toCol];
    nb[m.toRow][m.toCol]=nb[m.fromRow][m.fromCol];nb[m.fromRow][m.fromCol]=null;
    return {board:nb,captured:cap};
  }

  _getMoveNotation(move, board) {
    const piece = board[move.fromRow][move.fromCol];
    if (!piece) return '';
    const side = piece.side;
    const name = ccPieceChar(piece.type, side, true);
    let fromCol, toCol;
    if (side === RED) { fromCol = 9 - move.fromCol; toCol = 9 - move.toCol; }
    else { fromCol = move.fromCol + 1; toCol = move.toCol + 1; }
    const dRow = move.toRow - move.fromRow;
    const dCol = move.toCol - move.fromCol;
    let dir = '';
    if (dCol !== 0) { dir = '平'; }
    else { dir = side === RED ? (dRow < 0 ? '进' : '退') : (dRow > 0 ? '进' : '退'); }
    return `${name}${fromCol}${dir}${toCol}`;
  }

  _evaluate(b, side) {
    let score = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (!p) continue;
        let v = CC_VALUES[p.type];
        if (p.type === CC_PAWN && this._crossedRiver(r, p.side)) v = CC_PAWN_CROSSED;
        const rowIdx = p.side === BLACK ? r : 9 - r;
        switch (p.type) {
          case CC_ROOK: v += ROOK_BONUS[rowIdx][c]; break;
          case CC_HORSE: v += HORSE_BONUS[rowIdx][c]; break;
          case CC_CANNON: v += CANNON_BONUS[rowIdx][c]; break;
          case CC_PAWN: v += PAWN_BONUS[rowIdx][c]; break;
        }
        score += p.side === side ? v : -v;
      }
    }
    return score;
  }

  _orderMoves(board, moves) {
    return moves.sort((a,m2)=>{
      const ca=board[a.toRow][a.toCol],cb=board[m2.toRow][m2.toCol];
      const va=ca?CC_VALUES[ca.type]:0,vb=cb?CC_VALUES[cb.type]:0;
      if(va!==vb)return vb-va;
      return (board[m2.fromRow][m2.fromCol]?CC_VALUES[board[m2.fromRow][m2.fromCol].type]:0)-(board[a.fromRow][a.fromCol]?CC_VALUES[board[a.fromRow][a.fromCol].type]:0);
    });
  }

  _minimax(b, depth, alpha, beta, isMax, side, deadline) {
    // 到达层数上限时不再直接静态评估，而是做静态搜索 ——
    // 否则会出现地平线效应：AI 算得到「下一层吃你一个马」，
    // 却看不到「再下一层被反吃一个车」，表现为大师档也会送子。
    if(depth===0)return this._quiesce(b,alpha,beta,isMax,side,deadline,3);
    // 每 64 个节点才取一次系统时间（原实现每个节点都调 Date.now()）
    this._nodes = (this._nodes || 0) + 1;
    if(deadline && (this._nodes & 63) === 0 && Date.now()>deadline)return this._evaluate(b,side);
    const curSide=isMax?side:1-side;
    const all=this._allLegalMoves(b,curSide);
    if(all.length===0)return isMax?-99999+depth:99999-depth;
    const ord=this._orderMoves(b,all);
    if(isMax){let me=-Infinity;for(const m of ord){const s=this._cloneBoard(b);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;me=Math.max(me,this._minimax(s,depth-1,alpha,beta,false,side,deadline));alpha=Math.max(alpha,me);if(beta<=alpha)break;}return me;}
    else{let me=Infinity;for(const m of ord){const s=this._cloneBoard(b);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;me=Math.min(me,this._minimax(s,depth-1,alpha,beta,true,side,deadline));beta=Math.min(beta,me);if(beta<=alpha)break;}return me;}
  }

  // 静态搜索：只展开吃子着法，直到局面「平静」或达到层数上限。
  // 沿用 _minimax 的打分约定 —— side 恒为 AI 方，分数始终从 AI 视角计算。
  _quiesce(b, alpha, beta, isMax, side, deadline, qdepth) {
    const stand = this._evaluate(b, side);
    if (qdepth <= 0) return stand;
    if (isMax) { if (stand >= beta) return beta; if (stand > alpha) alpha = stand; }
    else       { if (stand <= alpha) return alpha; if (stand < beta) beta = stand; }

    const all = this._allLegalMoves(b, isMax ? side : 1 - side);
    const caps = [];
    for (const m of all) if (b[m.toRow][m.toCol]) caps.push(m);
    if (caps.length === 0) return stand;
    // 吃子按被吃子价值降序，优先展开大子
    caps.sort((x, y) => CC_VALUES[b[y.toRow][y.toCol].type] - CC_VALUES[b[x.toRow][x.toCol].type]);

    let best = stand;
    for (const m of caps) {
      this._nodes = (this._nodes || 0) + 1;
      if (deadline && (this._nodes & 63) === 0 && Date.now() > deadline) break;
      const s = this._cloneBoard(b);
      s[m.toRow][m.toCol] = s[m.fromRow][m.fromCol];
      s[m.fromRow][m.fromCol] = null;
      const sc = this._quiesce(s, alpha, beta, !isMax, side, deadline, qdepth - 1);
      if (isMax) { if (sc > best) best = sc; if (best > alpha) alpha = best; }
      else       { if (sc < best) best = sc; if (best < beta)  beta  = best; }
      if (alpha >= beta) break;
    }
    return best;
  }

  _getAIMove() {
    this._nodes = 0;
    const all=this._allLegalMoves(this.board,BLACK);
    if(all.length===0)return null;
    if(this.difficulty===0){
      const ord=this._orderMoves(this.board,[...all]);
      const topN=Math.max(3,Math.floor(ord.length*0.6));
      return ord[Math.min(Math.floor(Math.random()*topN),ord.length-1)];
    }
    if(this.difficulty===1){
      let bm=all[0],bs=-Infinity;
      for(const m of this._orderMoves(this.board,[...all])){
        const s=this._cloneBoard(this.board);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;
        const sc=this._evaluate(s,BLACK);if(sc>bs){bs=sc;bm=m;}
      }
      return bm;
    }
    if(this.difficulty===2){
      const ord=this._orderMoves(this.board,[...all]).slice(0,30);
      let bm=ord[0],bs=-Infinity;
      for(const m of ord){
        const s=this._cloneBoard(this.board);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;
        const sc=this._minimax(s,3,-Infinity,Infinity,false,BLACK);if(sc>bs){bs=sc;bm=m;}
      }
      return bm;
    }
    // Master：迭代加深 + 3 秒预算。
    // 改进：① 上一层的最佳着法排到搜索序列首位，提高 α-β 剪枝率；
    //       ② 候选集随深度逐步放开，避免妙手被固定的 top25 永久截断。
    const deadline=Date.now()+3000;
    const ordered=this._orderMoves(this.board,[...all]);
    let bestMove=ordered[0], prevBest=null;
    for(let depth=1;depth<=6;depth++){
      if(Date.now()>deadline)break;
      const limit = depth<=2 ? 25 : (depth<=4 ? 40 : ordered.length);
      const ord=ordered.slice(0,limit);
      if(prevBest){
        const i=ord.indexOf(prevBest);
        if(i>0){ord.splice(i,1);ord.unshift(prevBest);}
      }
      let bm=ord[0],bs=-Infinity,searched=0;
      for(const m of ord){
        if(Date.now()>deadline)break;
        const s=this._cloneBoard(this.board);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;
        const sc=this._minimax(s,depth,-Infinity,Infinity,false,BLACK,deadline);
        if(sc>bs){bs=sc;bm=m;}
        searched++;
      }
      if(searched>0){bestMove=bm;prevBest=bm;}
    }
    return bestMove;
  }

  handleClick(mx, my) {
    if (this.gameOver || this.aiThinking) return;
    if (this.multiplayer) {
      const mySideNum = this.mySide === 'red' ? RED : BLACK;
      if (this.currentTurn !== mySideNum) return;
    }
    const cs = this.cellSize, px = this.padX, py = this.padY;
    const flip = this.multiplayer && this.mySide === 'black';
    let br = -1, bc = -1, bd = Infinity;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const vr = flip ? 9 - r : r, vc = flip ? 8 - c : c;
        const dx = mx - (px + vc * cs), dy = my - (py + vr * cs);
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < bd && d < cs*0.6) { bd = d; br = r; bc = c; }
      }
    }
    if (br < 0) return;
    if (this.selectedPiece) {
      const match = this.validMoves.find(m => m.toRow === br && m.toCol === bc);
      if (match) { this._executeMove(match); return; }
    }
    const clicked = this.board[br][bc];
    if (clicked && clicked.side === this.currentTurn) {
      this.selectedPiece = { row: br, col: bc };
      this.validMoves = this._getLegalMoves(this.board, br, bc);
      this.render();
      updateUI();
    } else { this.clearSelection(); }
  }

  _executeMove(move) {
    // ★ 模仿五子棋的简单模式：更新棋盘 → 脉冲动画 → 换回合 → 调度AI
    const piece = this.board[move.fromRow][move.fromCol];
    if (!piece) return;
    const notation = this._getMoveNotation(move, this.board);
    const boardBefore = this._cloneBoard(this.board);
    const { board: nb, captured } = this._makeMove(this.board, move);
    this.board = nb;
    if (captured) { (this.currentTurn === RED ? this.capturedByRed : this.capturedByBlack).push(captured); }
    this.moveHistory.push({ move, captured, boardBefore });
    this.lastMove = move;
    this.selectedPiece = null;
    this.validMoves = [];
    updateMoveLog(notation);

    // Simple pulse animation at destination (like Gomoku)
    const to = getBoardXY(move.toRow, move.toCol);
    animatePulse(to.x, to.y, 'rgba(255,200,80,0.9)', this.pieceR, 500);

    const prevTurn = this.currentTurn;
    this.currentTurn = 1 - this.currentTurn;
    this._checkGameEnd(prevTurn);
    this._soundAfterMove(captured, prevTurn);
    this.render();
    updateUI();

    if (this.multiplayer) {
      mp.sendMove({ fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol });
    } else if (!this.gameOver && this.currentTurn === BLACK) {
      this._scheduleAI();
    }
  }

  _scheduleAI() {
    this.aiThinking = true;
    updateUI();

    const delay = this.difficulty >= 2 ? 300 + Math.random() * 200 : 0;
    setTimeout(() => {
      if (this.gameOver) { this.aiThinking = false; updateUI(); return; }
      const move = this._getAIMove();
      if (move) {
        const piece = this.board[move.fromRow][move.fromCol];
        const notation = this._getMoveNotation(move, this.board);
        const from = getBoardXY(move.fromRow, move.fromCol);
        const to = getBoardXY(move.toRow, move.toCol);
        animatePulse(from.x, from.y, 'rgba(120,200,255,0.8)', this.pieceR, 400);
        setTimeout(() => animatePulse(to.x, to.y, 'rgba(120,200,255,0.9)', this.pieceR, 500), 400);
        const boardBefore = this._cloneBoard(this.board);
        const { board: nb, captured } = this._makeMove(this.board, move);
        this.board = nb;
        if (captured) this.capturedByBlack.push(captured);
        this.moveHistory.push({ move, captured, boardBefore });
        this.lastMove = move;
        this.currentTurn = RED;
        this.aiThinking = false;
        updateMoveLog(notation);
        this._checkGameEnd(BLACK);
        this._soundAfterMove(captured, BLACK);
        this.render();
        updateUI();
      } else {
        this.aiThinking = false;
        const allMoves = this._allLegalMoves(this.board, BLACK);
        if (allMoves.length === 0) {
          this.gameOver = true;
          this.gameResult = this._isInCheck(this.board, BLACK) ? '红方获胜！将死！' : '红方获胜！困毙黑方';
        }
        updateUI();
      }
    }, 250 + Math.random() * 150);
  }

  _checkGameEnd(justMoved) {
    // 记录局面指纹，供长将 / 重复局面判定
    this._trackPosition();

    const next = 1 - justMoved;
    const inCheck = this._isInCheck(this.board, next);
    const noMoves = this._allLegalMoves(this.board, next).length === 0;
    if (noMoves) {
      this.gameOver = true;
      this.gameResult = justMoved === RED ? '红方获胜！将死！' : '黑方获胜！将死！';
      if (!inCheck) this.gameResult = justMoved === RED ? '红方获胜！困毙黑方' : '黑方获胜！困毙红方';
      return;
    }
    // 自然限着：连续 60 回合（120 个半回合）无吃子判和
    if (this._noCapturePlies() >= 120) {
      this.gameOver = true;
      this.gameResult = '和棋！连续 60 回合无吃子（自然限着）';
      return;
    }
    // 长将判负 / 三次重复局面判和
    const rep = this._repetitionResult();
    if (rep) { this.gameOver = true; this.gameResult = rep; }
  }

  // 距上次吃子过了多少个半回合
  _noCapturePlies() {
    let n = 0;
    for (let i = this.moveHistory.length - 1; i >= 0; i--) {
      if (this.moveHistory[i].captured) break;
      n++;
    }
    return n;
  }

  // 局面指纹：行棋方 + 全部棋子位置与归属
  _positionKey() {
    let s = this.currentTurn + '|';
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = this.board[r][c];
      s += p ? (p.side * 7 + p.type) + ',' : '.';
    }
    return s;
  }

  _trackPosition() {
    if (!this._posKeys) this._posKeys = [];
    this._posKeys.push({
      key: this._positionKey(),
      checked: this._isInCheck(this.board, this.currentTurn),
    });
  }

  // 三次重复局面：若三次都是「轮到走子的一方被将」→ 判长将，长将方负；否则判和
  _repetitionResult() {
    const h = this._posKeys || [];
    if (h.length < 3) return null;
    const last = h[h.length - 1];
    let same = 0, allChecked = true;
    for (const x of h) {
      if (x.key === last.key) { same++; if (!x.checked) allChecked = false; }
    }
    if (same < 3) return null;
    const checker = 1 - this.currentTurn;
    if (allChecked) {
      return checker === RED ? '黑方获胜！红方长将判负' : '红方获胜！黑方长将判负';
    }
    return '和棋！三次重复局面';
  }

  // 音效：终局播胜负音，否则落子/吃子音，被将时追加提示音
  _soundAfterMove(captured, justMoved) {
    const r = this.gameResult || '';
    const mySide = this.multiplayer ? (this.mySide === 'red' ? RED : BLACK) : RED;
    soundForMove({
      gameOver: this.gameOver,
      draw: r.indexOf('和棋') >= 0 || r.indexOf('平局') >= 0,
      iWon: justMoved === mySide,
      captured: !!captured,
      check: !this.gameOver && this._isInCheck(this.board, 1 - justMoved),
    });
  }


  applyOpponentMove(data) {
    if (this.gameOver) return;
    const legalMoves = this._allLegalMoves(this.board, this.currentTurn);
    const match = legalMoves.find(m =>
      m.fromRow === data.fromRow && m.fromCol === data.fromCol &&
      m.toRow === data.toRow && m.toCol === data.toCol
    );
    if (!match) { console.warn('[CC] Invalid opponent move', data); return; }
    const notation = this._getMoveNotation(match, this.board);
    const boardBefore = this._cloneBoard(this.board);
    const { board: nb, captured } = this._makeMove(this.board, match);
    this.board = nb;
    if (captured) {
      if (this.currentTurn === RED) this.capturedByRed.push(captured);
      else this.capturedByBlack.push(captured);
    }
    this.moveHistory.push({ move: match, captured, boardBefore });
    this.lastMove = match;
    const to = getBoardXY(match.toRow, match.toCol);
    animatePulse(to.x, to.y, 'rgba(120,200,255,0.9)', this.pieceR, 500);
    this.currentTurn = 1 - this.currentTurn;
    this._checkGameEnd(1 - this.currentTurn);
    this._soundAfterMove(captured, 1 - this.currentTurn);
    updateMoveLog(notation);
    this.render();
    updateUI();
  }

  clearSelection() { this.selectedPiece = null; this.validMoves = []; this.render(); updateUI(); }

  newGame() {
    this.board = this._createBoard();
    this.currentTurn = RED; this.selectedPiece = null; this.validMoves = [];
    this.moveHistory = []; this._posKeys = []; this.capturedByRed = []; this.capturedByBlack = [];
    this.gameOver = false; this.gameResult = ''; this.aiThinking = false; this.lastMove = null;
    this.multiplayer = false; this.mySide = null; this.opponentSide = null;
    this._calcSizes();
    currentRenderFn = () => this.render();
    this.render();
    updateUI();
  }

  undo() {
    if (this.gameOver || this.aiThinking) return;
    if (this.moveHistory.length === 0) return;
    const steps = this.currentTurn === RED ? Math.min(2, this.moveHistory.length) : 1;
    for (let i = 0; i < steps; i++) {
      const e = this.moveHistory.pop();
      this.board = e.boardBefore;
      if (e.captured) { (e.captured.side === RED ? this.capturedByBlack : this.capturedByRed).pop(); }
    }
    this.lastMove = this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1].move : null;
    this.currentTurn = this.moveHistory.length % 2 === 0 ? RED : BLACK;
    this.clearSelection();
    updateUI();
    this.render();
  }

  render() {
    const ctx = this.ctx, w = this.boardW, h = this.boardH;
    ctx.clearRect(0, 0, w, h);
    const T = themeColors();
    ctx.fillStyle = T.boardBg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    const cs = this.cellSize, px = this.padX, py = this.padY;
    const flip = this.multiplayer && this.mySide === 'black';
    const tx = c => px + (flip ? 8 - c : c) * cs;
    const ty = r => py + (flip ? 9 - r : r) * cs;
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 1; ctx.beginPath();
    for (let r = 0; r < 10; r++) { const y = ty(r); ctx.moveTo(tx(0), y); ctx.lineTo(tx(8), y); }
    for (let c = 0; c < 9; c++) { const x = tx(c); ctx.moveTo(x, ty(0)); ctx.lineTo(x, ty(4)); ctx.moveTo(x, ty(5)); ctx.lineTo(x, ty(9)); }
    ctx.moveTo(tx(0), ty(0)); ctx.lineTo(tx(0), ty(9)); ctx.moveTo(tx(8), ty(0)); ctx.lineTo(tx(8), ty(9));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx(3), ty(0)); ctx.lineTo(tx(5), ty(2)); ctx.moveTo(tx(5), ty(0)); ctx.lineTo(tx(3), ty(2));
    ctx.moveTo(tx(3), ty(7)); ctx.lineTo(tx(5), ty(9)); ctx.moveTo(tx(5), ty(7)); ctx.lineTo(tx(3), ty(9));
    ctx.stroke();
    const ry = (ty(4) + ty(5)) / 2;
    // 楚河汉界：原实现给「汉界」加了 scale(-1,1)，导致字被镜像成「界汉」，
    // 这里改为正常绘制。
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = T.boardLine;
    ctx.font = `${cs * 0.46}px "KaiTi","STKaiti","Noto Serif SC",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('楚  河', tx(2), ry);
    ctx.fillText('汉  界', tx(6), ry);
    ctx.restore();

    if (this.lastMove) {
      ctx.strokeStyle = T.accent; ctx.globalAlpha = .55; ctx.lineWidth = 2;
      for (const [r, c] of [[this.lastMove.fromRow, this.lastMove.fromCol], [this.lastMove.toRow, this.lastMove.toCol]]) {
        ctx.beginPath(); ctx.arc(tx(c), ty(r), this.pieceR + 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (this.selectedPiece) {
      ctx.beginPath(); ctx.arc(tx(this.selectedPiece.col), ty(this.selectedPiece.row), this.pieceR + 3, 0, Math.PI * 2);
      ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.stroke();
    }
    for (const m of this.validMoves) {
      const x = tx(m.toCol), y = ty(m.toRow);
      if (this.board[m.toRow][m.toCol]) {
        ctx.beginPath(); ctx.arc(x, y, this.pieceR + 3, 0, Math.PI * 2);
        ctx.strokeStyle = T.pieceRed; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, this.pieceR * 0.17), 0, Math.PI * 2);
        ctx.fillStyle = T.accent; ctx.globalAlpha = .8; ctx.fill(); ctx.globalAlpha = 1;
      }
    }

    const slideAnim = animations.find(a => a.type === 'slide');
    let slideFromR = -1, slideFromC = -1;
    if (slideAnim && this.lastMove) { slideFromR = this.lastMove.fromRow; slideFromC = this.lastMove.fromCol; }
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        if (slideAnim && r === slideFromR && c === slideFromC) continue;
        const piece = this.board[r][c];
        if (piece) this._drawPiece(r, c, piece);
      }
    }
  }

  _drawPiece(row, col, piece) {
    const flip = this.multiplayer && this.mySide === 'black';
    const ctx = this.ctx, x = this.padX + (flip ? 8 - col : col) * this.cellSize, y = this.padY + (flip ? 9 - row : row) * this.cellSize;
    const r = this.pieceR, T = themeColors();
    const ring = piece.side === RED ? T.pieceRed : T.pieceBlack;
    // 扁平棋子：实心面 + 单圈描边，去掉原先的径向渐变与投影
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = T.pieceFace; ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1.5, r * 0.11); ctx.stroke();
    ctx.fillStyle = ring;
    ctx.font = `${r * 1.02}px "KaiTi","STKaiti","Noto Serif SC",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ccPieceChar(piece.type, piece.side), x, y + r * 0.03);
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
    return `<div><div class="section-title">难度 · Difficulty</div>
      <div class="diff-group" id="ccDiffGroup">
        ${diffButtonsHTML(this.difficulty)}
      </div></div>`;
  }

  bindPanelEvents() {
    const self = this;
    document.getElementById('ccDiffGroup').addEventListener('click', function(e) {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      this.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      self.difficulty = parseInt(btn.dataset.diff);
      saveDifficulty('chinese-chess', self.difficulty);
      if (self.moveHistory.length > 0) self.newGame();
    });
  }

  getCapturedHTML() {
    const sortP = p => [...p].sort((a,b)=>CC_VALUES[b.type]-CC_VALUES[a.type]);
    return `<div class="captured-group"><div class="captured-label"><span class="dot red-dot"></span> 红方吃子</div>
      <div class="captured-pieces">${sortP(this.capturedByRed).map(p=>`<span class="captured-piece black-piece">${ccPieceChar(p.type,p.side)}</span>`).join('')||'<span class="empty-hint">暂无</span>'}</div></div>
      <div class="captured-group"><div class="captured-label"><span class="dot black-dot"></span> 黑方吃子</div>
      <div class="captured-pieces">${sortP(this.capturedByBlack).map(p=>`<span class="captured-piece red-piece">${ccPieceChar(p.type,p.side)}</span>`).join('')||'<span class="empty-hint">暂无</span>'}</div></div>`;
  }

  getStatusText() {
    if (this.gameOver) return this.gameResult;
    if (this.aiThinking) return '电脑思考中…';
    if (this.selectedPiece) return '请点击目标位置走棋';
    if (this.multiplayer) {
      const mySideNum = this.mySide === 'red' ? RED : BLACK;
      const isMyTurn = this.currentTurn === mySideNum;
      return this.currentTurn === RED ? `红方走棋${isMyTurn ? ' (你)' : ' (对手)'}` : `黑方走棋${isMyTurn ? ' (你)' : ' (对手)'}`;
    }
    return this.currentTurn === RED ? '红方走棋' : '黑方走棋';
  }
  getHintText() { return '点击己方棋子选中 · 点击目标位置走棋 · Esc取消'; }
  cleanup() {}
}

