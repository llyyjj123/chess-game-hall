/* ===============================================================
   js/games/chess.js
   游戏 · 国际象棋
   自 index.html 第 1826-2617 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ===================================================================
//  INTERNATIONAL CHESS (国际象棋)
// ===================================================================

const IC_PAWN = 0, IC_KNIGHT = 1, IC_BISHOP = 2, IC_ROOK = 3, IC_QUEEN = 4, IC_KING = 5;
const IC_WHITE = 0, IC_BLACK = 1;
const IC_CHARS = ['♙♟','♘♞','♗♝','♖♜','♕♛','♔♚'];
const IC_VALUES = [100, 320, 330, 500, 900, 20000];

// Piece-square tables (White perspective: row 0 = rank 8, row 7 = rank 1)
const IC_KNIGHT_PST = [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]];
const IC_BISHOP_PST = [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,10,10,10,10,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]];
const IC_ROOK_PST = [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]];
const IC_QUEEN_PST = [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]];
const IC_KING_MID_PST = [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]];
const IC_PAWN_PST = [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]];

class ChessGame {
  constructor(canvas, ctx) {
    this.canvas = canvas; this.ctx = ctx;
    this.statusDotClass = 'white';
    this.undoLogCount = 2;
  }

  init() {
    this.board = this._createBoard();
    this.currentTurn = IC_WHITE;
    this.selectedPiece = null;
    this.validMoves = [];
    this.moveHistory = [];
    this.capturedByWhite = []; // pieces captured BY white (were black)
    this.capturedByBlack = []; // pieces captured BY black (were white)
    this.gameOver = false;
    this.gameResult = '';
    this.difficulty = loadDifficulty('chess', 1);
    this.aiThinking = false;
    this.lastMove = null;
    this.castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassantTarget = null;
    this.promotionPending = null;
    this.multiplayer = false;
    this.mySide = null;
    this.opponentSide = null;
    this._calcSizes();
    this.render();
    updateUI();
  }

  _calcSizes() {
    const avail = availableBoardSize(520, 580);
    this.cellSize = Math.max(14, Math.floor(Math.min(avail.w / 8.5, avail.h / 8.5)));
    this.padX = Math.floor(this.cellSize * 0.5);
    this.padY = Math.floor(this.cellSize * 0.5);
    this.pieceR = Math.floor(this.cellSize * 0.42);
    const bw = 8 * this.cellSize + this.padX * 2;
    const bh = 8 * this.cellSize + this.padY * 2;
    this.boardW = bw; this.boardH = bh;
    setupCanvas(bw, bh);
    const cs = this.cellSize, px = this.padX, py = this.padY;
    getBoardXY = (r, c) => ({ x: px + c * cs + cs/2, y: py + r * cs + cs/2 });
  }

  _createBoard() {
    const b = Array.from({length:8},()=>Array(8).fill(null));
    const p = (r,c,t,s) => { b[r][c]={type:t,side:s}; };
    // Black pieces (top, rows 0-1)
    p(0,0,IC_ROOK,IC_BLACK);p(0,1,IC_KNIGHT,IC_BLACK);p(0,2,IC_BISHOP,IC_BLACK);p(0,3,IC_QUEEN,IC_BLACK);
    p(0,4,IC_KING,IC_BLACK);p(0,5,IC_BISHOP,IC_BLACK);p(0,6,IC_KNIGHT,IC_BLACK);p(0,7,IC_ROOK,IC_BLACK);
    for(let c=0;c<8;c++)p(1,c,IC_PAWN,IC_BLACK);
    // White pieces (bottom, rows 6-7)
    for(let c=0;c<8;c++)p(6,c,IC_PAWN,IC_WHITE);
    p(7,0,IC_ROOK,IC_WHITE);p(7,1,IC_KNIGHT,IC_WHITE);p(7,2,IC_BISHOP,IC_WHITE);p(7,3,IC_QUEEN,IC_WHITE);
    p(7,4,IC_KING,IC_WHITE);p(7,5,IC_BISHOP,IC_WHITE);p(7,6,IC_KNIGHT,IC_WHITE);p(7,7,IC_ROOK,IC_WHITE);
    return b;
  }

  _cloneBoard(b) { return b.map(r=>r.map(c=>c?{...c}:null)); }
  _inBounds(r,c) { return r>=0&&r<8&&c>=0&&c<8; }

  _getPieceChar(type, side) {
    return IC_CHARS[type][side];
  }

  _getRawMoves(b, row, col, castlingRights, enPassant) {
    const piece=b[row][col];
    if(!piece)return[];
    const moves=[], side=piece.side, opp=1-side;

    const addMove=(tr,tc,extra={})=>{
      if(!this._inBounds(tr,tc))return;
      const t=b[tr][tc];
      if(t&&t.side===side)return;
      moves.push({fromRow:row,fromCol:col,toRow:tr,toCol:tc,...extra});
    };

    const slide=(drs,dcs)=>{
      for(const[dr,dc]of [[drs,dcs],[-drs,-dcs],[drs,-dcs],[-drs,dcs]]){
        for(let i=1;i<8;i++){const tr=row+dr*i,tc=col+dc*i;if(!this._inBounds(tr,tc))break;const t=b[tr][tc];if(t){if(t.side===opp)addMove(tr,tc);break;}addMove(tr,tc);}
      }
    };

    switch(piece.type){
      case IC_KING:
        for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])addMove(row+dr,col+dc);
        // Castling
        if(castlingRights){
          if(side===IC_WHITE){
            if(castlingRights.wK&&!b[7][5]&&!b[7][6]&&b[7][7]&&b[7][7].type===IC_ROOK)addMove(7,6,{castle:'K'});
            if(castlingRights.wQ&&!b[7][3]&&!b[7][2]&&!b[7][1]&&b[7][0]&&b[7][0].type===IC_ROOK)addMove(7,2,{castle:'Q'});
          }else{
            if(castlingRights.bK&&!b[0][5]&&!b[0][6]&&b[0][7]&&b[0][7].type===IC_ROOK)addMove(0,6,{castle:'K'});
            if(castlingRights.bQ&&!b[0][3]&&!b[0][2]&&!b[0][1]&&b[0][0]&&b[0][0].type===IC_ROOK)addMove(0,2,{castle:'Q'});
          }
        }
        break;
      case IC_QUEEN:
        slide(1,1);slide(1,0);slide(0,1);break;
      case IC_ROOK:
        for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
          for(let i=1;i<8;i++){const tr=row+dr*i,tc=col+dc*i;if(!this._inBounds(tr,tc))break;const t=b[tr][tc];if(t){if(t.side===opp)addMove(tr,tc);break;}addMove(tr,tc);}
        }break;
      case IC_BISHOP:
        for(const[dr,dc]of[[-1,-1],[-1,1],[1,-1],[1,1]]){
          for(let i=1;i<8;i++){const tr=row+dr*i,tc=col+dc*i;if(!this._inBounds(tr,tc))break;const t=b[tr][tc];if(t){if(t.side===opp)addMove(tr,tc);break;}addMove(tr,tc);}
        }break;
      case IC_KNIGHT:
        for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])addMove(row+dr,col+dc);
        break;
      case IC_PAWN:
        const fwd=side===IC_WHITE?-1:1;
        const startRow=side===IC_WHITE?6:1;
        // Forward
        if(!b[row+fwd][col]){addMove(row+fwd,col,{pawnMove:true});if(row===startRow&&!b[row+fwd*2][col])addMove(row+fwd*2,col);}
        // Captures
        for(const dc of[-1,1]){
          const tc=col+dc;
          if(this._inBounds(row+fwd,tc)){
            if(b[row+fwd][tc]&&b[row+fwd][tc].side===opp)addMove(row+fwd,tc);
            if(enPassant&&enPassant.row===row+fwd&&enPassant.col===tc)addMove(row+fwd,tc,{enPassant:true});
          }
        }
        break;
    }
    return moves;
  }

  _findKing(b, side) {
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=b[r][c];if(p&&p.type===IC_KING&&p.side===side)return{row:r,col:c};}
    return null;
  }

  // 从王的位置向外扫描判断是否被将（原实现为全盘扫描 + 为每个敌子生成走法）
  _isInCheck(b, side) {
    const kp = this._findKing(b, side);
    if (!kp) return true;
    const kr = kp.row, kc = kp.col, opp = 1 - side;

    // 车 / 后：4 条直线，取第一个阻挡子
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      for (let i = 1; i < 8; i++) {
        const r = kr + dr * i, c = kc + dc * i;
        if (!this._inBounds(r, c)) break;
        const p = b[r][c];
        if (!p) continue;
        if (p.side === opp && (p.type === IC_ROOK || p.type === IC_QUEEN)) return true;
        break;
      }
    }
    // 象 / 后：4 条斜线
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      for (let i = 1; i < 8; i++) {
        const r = kr + dr * i, c = kc + dc * i;
        if (!this._inBounds(r, c)) break;
        const p = b[r][c];
        if (!p) continue;
        if (p.side === opp && (p.type === IC_BISHOP || p.type === IC_QUEEN)) return true;
        break;
      }
    }
    // 马：8 个位置，无蹩腿
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r = kr + dr, c = kc + dc;
      if (!this._inBounds(r, c)) continue;
      const p = b[r][c];
      if (p && p.side === opp && p.type === IC_KNIGHT) return true;
    }
    // 兵：白兵向行号减小方向走，故敌兵位于王的「后一横行」的左右斜格
    const fwd = opp === IC_WHITE ? -1 : 1;
    const pr = kr - fwd;
    if (this._inBounds(pr, kc - 1) && b[pr][kc - 1] && b[pr][kc - 1].side === opp && b[pr][kc - 1].type === IC_PAWN) return true;
    if (this._inBounds(pr, kc + 1) && b[pr][kc + 1] && b[pr][kc + 1].side === opp && b[pr][kc + 1].type === IC_PAWN) return true;
    // 王：相邻（合法局面不会出现，但保持与原实现一致的判定）
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const r = kr + dr, c = kc + dc;
      if (!this._inBounds(r, c)) continue;
      const p = b[r][c];
      if (p && p.side === opp && p.type === IC_KING) return true;
    }
    return false;
  }

  // 走子后的易位权与吃过路兵目标格。
  // 搜索里必须逐层更新 —— 原实现把 cr/ep 原样递归传递，
  // 导致搜索中易位权永不失效、吃过路兵永远搜不到。
  _advanceState(b, m, cr, ep) {
    const piece = b[m.fromRow][m.fromCol];
    let nEp = null;
    if (piece && piece.type === IC_PAWN && Math.abs(m.toRow - m.fromRow) === 2) {
      nEp = { row: (m.fromRow + m.toRow) / 2, col: m.fromCol };
    }
    if (!cr) return { cr: cr, ep: nEp };
    const nCr = { wK: cr.wK, wQ: cr.wQ, bK: cr.bK, bQ: cr.bQ };
    if (piece && piece.type === IC_KING) {
      if (piece.side === IC_WHITE) { nCr.wK = false; nCr.wQ = false; }
      else { nCr.bK = false; nCr.bQ = false; }
    }
    if (piece && piece.type === IC_ROOK) {
      if (piece.side === IC_WHITE && m.fromRow === 7) {
        if (m.fromCol === 0) nCr.wQ = false;
        if (m.fromCol === 7) nCr.wK = false;
      }
      if (piece.side === IC_BLACK && m.fromRow === 0) {
        if (m.fromCol === 0) nCr.bQ = false;
        if (m.fromCol === 7) nCr.bK = false;
      }
    }
    return { cr: nCr, ep: nEp };
  }

  _getLegalMoves(b, row, col, castlingRights, enPassant) {
    const piece=b[row][col];if(!piece)return[];
    const raw=this._getRawMoves(b,row,col,castlingRights,enPassant),legal=[];
    for(const m of raw){
      const sim=this._cloneBoard(b);
      sim[m.toRow][m.toCol]=sim[m.fromRow][m.fromCol];sim[m.fromRow][m.fromCol]=null;
      if(m.castle){
        // Move rook for castling simulation
        const rkRow=m.toRow;
        if(m.castle==='K'){sim[rkRow][5]=sim[rkRow][7];sim[rkRow][7]=null;}
        else{sim[rkRow][3]=sim[rkRow][0];sim[rkRow][0]=null;}
        // King can't castle through check
        if(this._isInCheck(sim,piece.side))continue;
        // Check intermediate square
        const sim2=this._cloneBoard(b);
        if(m.castle==='K'){sim2[rkRow][5]=sim2[rkRow][4];sim2[rkRow][4]=null;}
        else{sim2[rkRow][3]=sim2[rkRow][4];sim2[rkRow][4]=null;}
        if(this._isInCheck(sim2,piece.side))continue;
      }
      if(this._isInCheck(sim,piece.side))continue;
      legal.push(m);
    }
    return legal;
  }

  _allLegalMoves(b, side, castlingRights, enPassant) {
    const all=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){if(b[r][c]&&b[r][c].side===side){for(const m of this._getLegalMoves(b,r,c,castlingRights,enPassant))all.push(m);}}
    return all;
  }

  _notation(move, board) {
    const piece=board[move.fromRow][move.fromCol];
    if(!piece)return '';
    const fCol=String.fromCharCode(97+move.fromCol);
    const tCol=String.fromCharCode(97+move.toCol);
    const fRow=8-move.fromRow,tRow=8-move.toRow;
    const name=piece.type===IC_PAWN?'':['N','B','R','Q','K'][piece.type-1];
    const cap=board[move.toRow][move.toCol]?'x':'';
    let extra='';
    if(move.castle)extra=move.castle==='K'?'O-O':'O-O-O';
    if(move.promotion)extra='='+move.promotion;
    if(move.enPassant)extra=' e.p.';
    if(move.castle)return extra;
    return `${name}${cap}${tCol}${tRow}${extra}`;
  }

  // ── AI ──
  _evaluate(b) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p) continue;
        let v = IC_VALUES[p.type];
        const rowIdx = p.side === IC_WHITE ? r : 7 - r;
        switch (p.type) {
          case IC_PAWN: v += IC_PAWN_PST[rowIdx][c]; break;
          case IC_KNIGHT: v += IC_KNIGHT_PST[rowIdx][c]; break;
          case IC_BISHOP: v += IC_BISHOP_PST[rowIdx][c]; break;
          case IC_ROOK: v += IC_ROOK_PST[rowIdx][c]; break;
          case IC_QUEEN: v += IC_QUEEN_PST[rowIdx][c]; break;
          case IC_KING: v += IC_KING_MID_PST[rowIdx][c]; break;
        }
        // 黑方（AI）视角：黑子 +v、白子 -v。
        // 原实现是白方视角（白 +v），而 AI 执黑且根节点取最大值，
        // 结果 AI 会主动避开吃子 —— 实测它面对白后无保护时选择不吃。
        score += p.side === IC_WHITE ? -v : v;
      }
    }
    return score;
  }

  _orderMoves(board, moves) {
    return moves.sort((a,m2)=>{
      const ca=board[a.toRow][a.toCol],cb=board[m2.toRow][m2.toCol];
      const va=ca?IC_VALUES[ca.type]:0,vb=cb?IC_VALUES[cb.type]:0;
      return vb-va;
    });
  }

  _minimax(b, depth, alpha, beta, isMax, cr, ep, deadline) {
    // 到达层数上限时改做静态搜索，消除地平线效应（AI 算得到下一层吃子、
    // 却看不到再下一层被反吃，表现为大师档也会送子）
    if(depth===0)return this._quiesce(b,alpha,beta,isMax,cr,ep,deadline,3);
    // 每 64 个节点才取一次系统时间（原实现每个节点都调 Date.now()）
    this._nodes = (this._nodes || 0) + 1;
    if(deadline && (this._nodes & 63) === 0 && Date.now()>deadline)return this._evaluate(b);
    // isMax 表示「轮到 AI(黑) 走」。原实现写成 isMax?IC_WHITE:IC_BLACK，
    // 与实际行棋方错开一层 —— 传入的 b 已经是黑方走完后的局面，
    // 却仍按「黑方走」去生成着法，整棵搜索树的行棋方全是错的。
    const curSide=isMax?IC_BLACK:IC_WHITE;
    const all=this._allLegalMoves(b,curSide,cr,ep);
    if(all.length===0){
      if(this._isInCheck(b,curSide))return isMax?-99999+depth:99999-depth;
      return 0; // Stalemate
    }
    const ord=this._orderMoves(b,all);
    // ns 为走子后的易位权/吃过路兵状态，必须逐层传递（原实现传的是根节点的值）
    if(isMax){let me=-Infinity;for(const m of ord){const ns=this._advanceState(b,m,cr,ep);const s=this._cloneBoard(b);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;if(m.enPassant)s[m.fromRow][m.toCol]=null;me=Math.max(me,this._minimax(s,depth-1,alpha,beta,false,ns.cr,ns.ep,deadline));alpha=Math.max(alpha,me);if(beta<=alpha)break;}return me;}
    else{let me=Infinity;for(const m of ord){const ns=this._advanceState(b,m,cr,ep);const s=this._cloneBoard(b);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;if(m.enPassant)s[m.fromRow][m.toCol]=null;me=Math.min(me,this._minimax(s,depth-1,alpha,beta,true,ns.cr,ns.ep,deadline));beta=Math.min(beta,me);if(beta<=alpha)break;}return me;}
  }

  // 静态搜索：只展开吃子（含吃过路兵），直到局面平静或达到层数上限。
  // 打分约定与 _minimax 一致 —— isMax 表示「轮到 AI(黑) 走」。
  _quiesce(b, alpha, beta, isMax, cr, ep, deadline, qdepth) {
    const stand = this._evaluate(b);
    if (qdepth <= 0) return stand;
    if (isMax) { if (stand >= beta) return beta; if (stand > alpha) alpha = stand; }
    else       { if (stand <= alpha) return alpha; if (stand < beta) beta = stand; }

    const curSide = isMax ? IC_BLACK : IC_WHITE;
    const all = this._allLegalMoves(b, curSide, cr, ep);
    const caps = [];
    for (const m of all) if (b[m.toRow][m.toCol] || m.enPassant) caps.push(m);
    if (caps.length === 0) return stand;
    // 按被吃子价值降序，优先展开大子
    caps.sort((x, y) => {
      const vx = b[x.toRow][x.toCol] ? IC_VALUES[b[x.toRow][x.toCol].type] : 0;
      const vy = b[y.toRow][y.toCol] ? IC_VALUES[b[y.toRow][y.toCol].type] : 0;
      return vy - vx;
    });

    let best = stand;
    for (const m of caps) {
      this._nodes = (this._nodes || 0) + 1;
      if (deadline && (this._nodes & 63) === 0 && Date.now() > deadline) break;
      const ns = this._advanceState(b, m, cr, ep);
      const s = this._cloneBoard(b);
      s[m.toRow][m.toCol] = s[m.fromRow][m.fromCol];
      s[m.fromRow][m.fromCol] = null;
      if (m.enPassant) s[m.fromRow][m.toCol] = null;
      const sc = this._quiesce(s, alpha, beta, !isMax, ns.cr, ns.ep, deadline, qdepth - 1);
      if (isMax) { if (sc > best) best = sc; if (best > alpha) alpha = best; }
      else       { if (sc < best) best = sc; if (best < beta)  beta  = best; }
      if (alpha >= beta) break;
    }
    return best;
  }

  _getAIMove() {
    this._nodes = 0;
    const all=this._allLegalMoves(this.board,IC_BLACK,this.castlingRights,this.enPassantTarget);
    if(all.length===0)return null;
    const cr0=this.castlingRights, ep0=this.enPassantTarget;
    if(this.difficulty===0){
      const ord=this._orderMoves(this.board,[...all]);
      const topN=Math.max(3,Math.floor(ord.length*0.5));
      return ord[Math.min(Math.floor(Math.random()*topN),ord.length-1)];
    }
    if(this.difficulty===1){
      let bm=all[0],bs=-Infinity;
      for(const m of this._orderMoves(this.board,[...all])){
        const s=this._cloneBoard(this.board);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;
        if(m.enPassant)s[m.fromRow][m.toCol]=null;
        const sc=this._evaluate(s);if(sc>bs){bs=sc;bm=m;}
      }
      return bm;
    }
    if(this.difficulty===2){
      const ord=this._orderMoves(this.board,[...all]).slice(0,30);
      let bm=ord[0],bs=-Infinity;
      for(const m of ord){
        const ns=this._advanceState(this.board,m,cr0,ep0);
        const s=this._cloneBoard(this.board);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;
        if(m.enPassant)s[m.fromRow][m.toCol]=null;
        const sc=this._minimax(s,3,-Infinity,Infinity,false,ns.cr,ns.ep);
        if(sc>bs){bs=sc;bm=m;}
      }
      return bm;
    }
    // Master：迭代加深 + 3 秒预算。
    // 改进：① 上一层的最佳着法排到搜索序列首位，提高 α-β 剪枝率；
    //       ② 候选集随深度逐步放开，避免妙手被固定的 top20 永久截断。
    const deadline=Date.now()+3000;
    const ordered=this._orderMoves(this.board,[...all]);
    let bestMove=ordered[0], prevBest=null;
    for(let depth=1;depth<=6;depth++){
      if(Date.now()>deadline)break;
      const limit = depth<=2 ? 20 : (depth<=4 ? 30 : ordered.length);
      const ord=ordered.slice(0,limit);
      if(prevBest){
        const i=ord.indexOf(prevBest);
        if(i>0){ord.splice(i,1);ord.unshift(prevBest);}
      }
      let bm=ord[0],bs=-Infinity,searched=0;
      for(const m of ord){
        if(Date.now()>deadline)break;
        const ns=this._advanceState(this.board,m,cr0,ep0);
        const s=this._cloneBoard(this.board);s[m.toRow][m.toCol]=s[m.fromRow][m.fromCol];s[m.fromRow][m.fromCol]=null;
        if(m.enPassant)s[m.fromRow][m.toCol]=null;
        const sc=this._minimax(s,depth,-Infinity,Infinity,false,ns.cr,ns.ep,deadline);
        if(sc>bs){bs=sc;bm=m;}
        searched++;
      }
      if(searched>0){bestMove=bm;prevBest=bm;}
    }
    return bestMove;
  }

  // ── GAME ACTIONS ──
  handleClick(mx, my) {
    if (this.gameOver || this.aiThinking || this.promotionPending) return;
    if (this.multiplayer && this.currentTurn !== (this.mySide === 'white' ? IC_WHITE : IC_BLACK)) return;
    const cs = this.cellSize, px = this.padX, py = this.padY;
    const col = Math.round((mx - px - cs/2) / cs);
    const row = Math.round((my - py - cs/2) / cs);
    if (row < 0 || row >= 8 || col < 0 || col >= 8) return;

    if (this.selectedPiece) {
      const match = this.validMoves.find(m => m.toRow === row && m.toCol === col);
      if (match) { this._executeMove(match); return; }
    }

    const clicked = this.board[row][col];
    if (clicked && clicked.side === this.currentTurn) {
      this.selectedPiece = { row, col };
      this.validMoves = this._getLegalMoves(this.board, row, col, this.castlingRights, this.enPassantTarget);
      this.render();
      updateUI();
    } else { this.clearSelection(); }
  }

  _executeMove(move) {
    try {
      const piece = this.board[move.fromRow][move.fromCol];
      if (!piece) return;
      const pieceCh = this._getPieceChar(piece.type, piece.side);
      const pieceClr = piece.side === IC_WHITE ? '#b33a2a' : '#1a2a3a';
      const notation = this._notation(move, this.board);

      // Check for pawn promotion (human player only)
      const promoRow = piece.side === IC_WHITE ? 0 : 7;
      if (piece.type === IC_PAWN && move.toRow === promoRow) {
        this.promotionPending = move;
        this._showPromotionDialog(piece.side, (promoType) => {
          move.promotion = promoType;
          this.promotionPending = null;
          this._doExecuteMove(move, piece, pieceCh, pieceClr, notation);
        });
        return;
      }

      this._doExecuteMove(move, piece, pieceCh, pieceClr, notation);
    } catch(e) {
      console.error('[IC] Error in _executeMove:', e);
      if (!this.gameOver && this.currentTurn === IC_BLACK && !this.aiThinking) {
        this._scheduleAI();
      }
    }
  }

// 音效：终局播胜负音，否则落子/吃子音，被将时追加提示音
  _soundAfterMove(captured, justMoved) {
    const r = this.gameResult || '';
    const mySide = this.multiplayer ? (this.mySide === 'white' ? IC_WHITE : IC_BLACK) : IC_WHITE;
    soundForMove({
      gameOver: this.gameOver,
      draw: r.indexOf('和棋') >= 0 || r.indexOf('平局') >= 0 || r.indexOf('逼和') >= 0,
      iWon: justMoved === mySide,
      captured: !!captured,
      check: !this.gameOver && this._isInCheck(this.board, 1 - justMoved),
    });
  }

  _doExecuteMove(move, piece, pieceCh, pieceClr, notation) {
    // ★ 模仿五子棋简单模式
    const boardBefore = this._cloneBoard(this.board);
    const oldCastling = {...this.castlingRights};
    const oldEnPassant = this.enPassantTarget;

    this.enPassantTarget = null;
    if (piece.type === IC_PAWN && Math.abs(move.toRow - move.fromRow) === 2) {
      this.enPassantTarget = { row: (move.fromRow + move.toRow) / 2, col: move.fromCol };
    }
    if (piece.type === IC_KING) {
      if (piece.side === IC_WHITE) { this.castlingRights.wK = false; this.castlingRights.wQ = false; }
      else { this.castlingRights.bK = false; this.castlingRights.bQ = false; }
    }
    if (piece.type === IC_ROOK) {
      if (piece.side === IC_WHITE && move.fromRow === 7) {
        if (move.fromCol === 0) this.castlingRights.wQ = false;
        if (move.fromCol === 7) this.castlingRights.wK = false;
      }
      if (piece.side === IC_BLACK && move.fromRow === 0) {
        if (move.fromCol === 0) this.castlingRights.bQ = false;
        if (move.fromCol === 7) this.castlingRights.bK = false;
      }
    }

    let captured = this.board[move.toRow][move.toCol];
    const nb = this._cloneBoard(this.board);
    if (move.enPassant) {
      captured = nb[move.fromRow][move.toCol];
      nb[move.fromRow][move.toCol] = null;
    }
    nb[move.toRow][move.toCol] = nb[move.fromRow][move.fromCol];
    nb[move.fromRow][move.fromCol] = null;
    if (move.promotion) {
      const promoMap = { Q: IC_QUEEN, R: IC_ROOK, B: IC_BISHOP, N: IC_KNIGHT };
      nb[move.toRow][move.toCol].type = promoMap[move.promotion];
    }
    if (move.castle) {
      const rkRow = move.toRow;
      if (move.castle === 'K') { nb[rkRow][5] = nb[rkRow][7]; nb[rkRow][7] = null; }
      else { nb[rkRow][3] = nb[rkRow][0]; nb[rkRow][0] = null; }
    }

    this.board = nb;
    if (captured) {
      if (this.currentTurn === IC_WHITE) this.capturedByWhite.push(captured);
      else this.capturedByBlack.push(captured);
    }
    this.moveHistory.push({ move, captured, boardBefore, oldCastling, oldEnPassant });
    this.lastMove = move;
    this.selectedPiece = null;
    this.validMoves = [];
    updateMoveLog(notation);

    // Simple pulse (like Gomoku) — no slide/trail complexity
    const to = getBoardXY(move.toRow, move.toCol);
    animatePulse(to.x, to.y, 'rgba(255,200,80,0.9)', this.pieceR, 500);

    const prevTurn = this.currentTurn;
    this.currentTurn = 1 - this.currentTurn;
    this._checkGameEnd(prevTurn);
    this._soundAfterMove(captured, prevTurn);
    this.render();
    updateUI();

    if (this.multiplayer) {
      mp.sendMove({ fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol, promotion: move.promotion || null });
    } else if (!this.gameOver && this.currentTurn === IC_BLACK) {
      this._scheduleAI();
    }
  }

  _showPromotionDialog(side, callback) {
    const dialog = document.getElementById('promotionDialog');
    const overlay = document.getElementById('overlay');
    const options = document.getElementById('promoOptions');
    const typeNames = ['Q', 'R', 'B', 'N'];

    options.innerHTML = [IC_QUEEN, IC_ROOK, IC_BISHOP, IC_KNIGHT].map((t, i) => {
      return `<button class="promo-btn">${this._getPieceChar(t, side)}</button>`;
    }).join('');

    overlay.style.display = 'block';
    dialog.style.display = 'block';

    const btns = options.querySelectorAll('.promo-btn');
    btns.forEach((btn, i) => {
      btn.onclick = () => {
        overlay.style.display = 'none';
        dialog.style.display = 'none';
        callback(typeNames[i]);
      };
    });

    const keyHandler = (e) => {
      const keyMap = { q: 0, r: 1, b: 2, n: 3 };
      const idx = keyMap[e.key.toLowerCase()];
      if (idx !== undefined) {
        document.removeEventListener('keydown', keyHandler);
        overlay.style.display = 'none';
        dialog.style.display = 'none';
        callback(typeNames[idx]);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  _doAIMoveDirect(move) {
    // Emergency fallback: apply AI move directly
    const piece = this.board[move.fromRow][move.fromCol];
    if (!piece) return;
    const captured = this.board[move.toRow][move.toCol];
    this.board[move.toRow][move.toCol] = piece;
    this.board[move.fromRow][move.fromCol] = null;
    if (captured) this.capturedByBlack.push(captured);
    this.lastMove = move;
    this.currentTurn = IC_WHITE;
    updateMoveLog(this._notation(move, this.board));
    this._checkGameEnd(IC_BLACK);
    this._soundAfterMove(captured, IC_BLACK);
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
        const notation = this._notation(move, this.board);
        const from = getBoardXY(move.fromRow, move.fromCol);
        const to = getBoardXY(move.toRow, move.toCol);
        animatePulse(from.x, from.y, 'rgba(120,200,255,0.8)', this.pieceR, 400);
        setTimeout(() => animatePulse(to.x, to.y, 'rgba(120,200,255,0.9)', this.pieceR, 500), 400);
        const boardBefore = this._cloneBoard(this.board);
        const oldEnPassant = this.enPassantTarget;
        this.enPassantTarget = null;
        if (piece.type === IC_PAWN && Math.abs(move.toRow - move.fromRow) === 2) {
          this.enPassantTarget = { row: (move.fromRow + move.toRow) / 2, col: move.fromCol };
        }
        let captured = this.board[move.toRow][move.toCol];
        const nb = this._cloneBoard(this.board);
        if (move.enPassant) {
          captured = nb[move.fromRow][move.toCol];
          nb[move.fromRow][move.toCol] = null;
        }
        nb[move.toRow][move.toCol] = nb[move.fromRow][move.fromCol];
        nb[move.fromRow][move.fromCol] = null;
        const promoRow = piece.side === IC_BLACK ? 7 : 0;
        if (piece.type === IC_PAWN && move.toRow === promoRow) {
          nb[move.toRow][move.toCol].type = IC_QUEEN;
        }
        this.board = nb;
        if (captured) this.capturedByBlack.push(captured);
        this.moveHistory.push({ move, captured, boardBefore, oldEnPassant });
        this.lastMove = move;
        this.currentTurn = IC_WHITE;
        this.aiThinking = false;
        updateMoveLog(notation);
        this._checkGameEnd(IC_BLACK);
        this._soundAfterMove(captured, IC_BLACK);
        this.render();
        updateUI();
      } else {
        this.aiThinking = false;
        const allMoves = this._allLegalMoves(this.board, IC_BLACK, this.castlingRights, this.enPassantTarget);
        if (allMoves.length === 0) {
          this.gameOver = true;
          this.gameResult = this._isInCheck(this.board, IC_BLACK) ? '白方获胜！将杀！' : '平局！逼和';
        } else {
          this._doAIMoveDirect(allMoves[Math.floor(Math.random() * allMoves.length)]);
        }
        updateUI();
      }
    }, 250 + Math.random() * 150);
  }

  _checkGameEnd(justMoved) {
    const next = 1 - justMoved;
    const inCheck = this._isInCheck(this.board, next);
    const noMoves = this._allLegalMoves(this.board, next, this.castlingRights, this.enPassantTarget).length === 0;
    if (noMoves) {
      this.gameOver = true;
      if (inCheck) {
        this.gameResult = justMoved === IC_WHITE ? '白方获胜！将杀！' : '黑方获胜！将杀！';
      } else {
        this.gameResult = '平局！逼和（Stalemate）';
      }
    }
  }

  clearSelection() { this.selectedPiece = null; this.validMoves = []; this.render(); updateUI(); }

  applyOpponentMove(data) {
    if (this.gameOver) return;
    const legalMoves = this._allLegalMoves(this.board, this.currentTurn, this.castlingRights, this.enPassantTarget);
    const match = legalMoves.find(m =>
      m.fromRow === data.fromRow && m.fromCol === data.fromCol &&
      m.toRow === data.toRow && m.toCol === data.toCol
    );
    if (!match) { console.warn('[IC] Invalid opponent move', data); return; }
    if (data.promotion) match.promotion = data.promotion;
    const piece = this.board[match.fromRow][match.fromCol];
    const notation = this._notation(match, this.board);
    const boardBefore = this._cloneBoard(this.board);
    const oldEnPassant = this.enPassantTarget;
    this.enPassantTarget = null;
    if (piece.type === IC_PAWN && Math.abs(match.toRow - match.fromRow) === 2) {
      this.enPassantTarget = { row: (match.fromRow + match.toRow) / 2, col: match.fromCol };
    }
    if (piece.type === IC_KING) {
      if (piece.side === IC_WHITE) { this.castlingRights.wK = false; this.castlingRights.wQ = false; }
      else { this.castlingRights.bK = false; this.castlingRights.bQ = false; }
    }
    if (piece.type === IC_ROOK) {
      if (piece.side === IC_WHITE && match.fromRow === 7) {
        if (match.fromCol === 0) this.castlingRights.wQ = false;
        if (match.fromCol === 7) this.castlingRights.wK = false;
      }
      if (piece.side === IC_BLACK && match.fromRow === 0) {
        if (match.fromCol === 0) this.castlingRights.bQ = false;
        if (match.fromCol === 7) this.castlingRights.bK = false;
      }
    }
    let captured = this.board[match.toRow][match.toCol];
    const nb = this._cloneBoard(this.board);
    if (match.enPassant) {
      captured = nb[match.fromRow][match.toCol];
      nb[match.fromRow][match.toCol] = null;
    }
    nb[match.toRow][match.toCol] = nb[match.fromRow][match.fromCol];
    nb[match.fromRow][match.fromCol] = null;
    const promoRow = piece.side === IC_BLACK ? 7 : 0;
    if (piece.type === IC_PAWN && match.toRow === promoRow) {
      nb[match.toRow][match.toCol].type = match.promotion ? { Q: IC_QUEEN, R: IC_ROOK, B: IC_BISHOP, N: IC_KNIGHT }[match.promotion] : IC_QUEEN;
    }
    if (match.castle) {
      const rkRow = match.toRow;
      if (match.castle === 'K') { nb[rkRow][5] = nb[rkRow][7]; nb[rkRow][7] = null; }
      else { nb[rkRow][3] = nb[rkRow][0]; nb[rkRow][0] = null; }
    }
    this.board = nb;
    if (captured) {
      if (this.currentTurn === IC_WHITE) this.capturedByWhite.push(captured);
      else this.capturedByBlack.push(captured);
    }
    this.moveHistory.push({ move: match, captured, boardBefore, oldEnPassant });
    this.lastMove = match;
    this.selectedPiece = null;
    this.validMoves = [];
    updateMoveLog(notation);
    const to = getBoardXY(match.toRow, match.toCol);
    animatePulse(to.x, to.y, 'rgba(120,200,255,0.9)', this.pieceR, 500);
    this.currentTurn = 1 - this.currentTurn;
    this._checkGameEnd(1 - this.currentTurn);
    this._soundAfterMove(captured, 1 - this.currentTurn);
    this.render();
    updateUI();
  }

  newGame() {
    this.board = this._createBoard();
    this.currentTurn = IC_WHITE; this.selectedPiece = null; this.validMoves = [];
    this.moveHistory = []; this.capturedByWhite = []; this.capturedByBlack = [];
    this.gameOver = false; this.gameResult = ''; this.aiThinking = false; this.lastMove = null;
    this.castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassantTarget = null; this.promotionPending = null;
    this.multiplayer = false; this.mySide = null; this.opponentSide = null;
    currentRenderFn = () => this.render();
    this.render();
    updateUI();
  }

  undo() {
    if (this.gameOver || this.aiThinking || this.moveHistory.length === 0) return;
    const steps = this.currentTurn === IC_WHITE ? Math.min(2, this.moveHistory.length) : 1;
    for (let i = 0; i < steps; i++) {
      const e = this.moveHistory.pop();
      this.board = e.boardBefore;
      if (e.oldCastling) this.castlingRights = e.oldCastling;
      if (e.oldEnPassant !== undefined) this.enPassantTarget = e.oldEnPassant;
      if (e.captured) { (e.captured.side === IC_WHITE ? this.capturedByBlack : this.capturedByWhite).pop(); }
    }
    this.lastMove = this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1].move : null;
    this.currentTurn = this.moveHistory.length % 2 === 0 ? IC_WHITE : IC_BLACK;
    this.clearSelection();
    updateUI();
    this.render();
  }

  // ── RENDERING ──
  render() {
    const ctx = this.ctx, w = this.boardW, h = this.boardH, cs = this.cellSize;
    const px = this.padX, py = this.padY;
    const T = themeColors();
    ctx.clearRect(0, 0, w, h);

    // Draw squares（跟随主题：浅格用棋盘底色，深格用线条色）
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = px + c * cs, y = py + r * cs;
        ctx.fillStyle = (r + c) % 2 === 0 ? T.boardBg : T.boardLine;
        ctx.fillRect(x, y, cs, cs);
      }
    }

    // Labels —— 缩小字号并居中，避免被画布边距裁掉
    ctx.fillStyle = T.boardLine;
    ctx.font = `${cs * 0.22}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let c = 0; c < 8; c++) {
      ctx.fillText(String.fromCharCode(97 + c), px + cs * c + cs / 2, py + cs * 8 + cs * 0.26);
    }
    for (let r = 0; r < 8; r++) {
      ctx.fillText(8 - r, px - cs * 0.26, py + cs * r + cs / 2);
    }

    // Border
    ctx.strokeStyle = T.boardLine; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, 8 * cs - 1, 8 * cs - 1);

    // Last move highlight
    if (this.lastMove) {
      for (const [r, c] of [[this.lastMove.fromRow, this.lastMove.fromCol], [this.lastMove.toRow, this.lastMove.toCol]]) {
        ctx.fillStyle = 'rgba(255, 200, 50, 0.35)';
        ctx.fillRect(px + c * cs, py + r * cs, cs, cs);
      }
    }

    // Check highlight
    if (!this.gameOver && this._isInCheck(this.board, this.currentTurn)) {
      const kp = this._findKing(this.board, this.currentTurn);
      if (kp) {
        ctx.fillStyle = 'rgba(255, 50, 50, 0.5)';
        ctx.fillRect(px + kp.col * cs, py + kp.row * cs, cs, cs);
      }
    }

    // Valid moves
    for (const m of this.validMoves) {
      const x = px + m.toCol * cs + cs/2, y = py + m.toRow * cs + cs/2;
      if (this.board[m.toRow][m.toCol]) {
        ctx.beginPath(); ctx.arc(x, y, this.pieceR + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220,50,50,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.beginPath(); ctx.arc(x, y, this.pieceR * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,180,80,0.6)'; ctx.fill();
      }
    }

    // Selected piece
    if (this.selectedPiece) {
      const x = px + this.selectedPiece.col * cs, y = py + this.selectedPiece.row * cs;
      ctx.fillStyle = 'rgba(255,215,0,0.4)'; ctx.fillRect(x, y, cs, cs);
    }

    // Draw pieces
    const slideAnim = animations.find(a => a.type === 'slide');
    let slideFromR = -1, slideFromC = -1;
    if (slideAnim && this.lastMove) { slideFromR = this.lastMove.fromRow; slideFromC = this.lastMove.fromCol; }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (slideAnim && r === slideFromR && c === slideFromC) continue;
        const piece = this.board[r][c];
        if (piece) this._drawPiece(r, c, piece);
      }
    }
  }

  _drawPiece(row, col, piece) {
    const ctx = this.ctx, cs = this.cellSize, px = this.padX, py = this.padY;
    const x = px + col * cs + cs/2, y = py + row * cs + cs/2;
    const r = this.pieceR;
    const isWhite = piece.side === IC_WHITE;
    // 扁平棋子：实心 + 细描边，去掉投影与径向渐变
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isWhite ? '#fbfbf8' : '#242424'; ctx.fill();
    ctx.strokeStyle = isWhite ? 'rgba(0,0,0,.28)' : '#000';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = isWhite ? '#8b3a2a' : '#d8e2ec';
    ctx.font = `${r * 1.25}px "Segoe UI Symbol", "Noto Sans Symbols", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this._getPieceChar(piece.type, piece.side), x, y + 1);
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
      <div class="diff-group" id="icDiffGroup">
        ${diffButtonsHTML(this.difficulty)}
      </div></div>`;
  }

  bindPanelEvents() {
    const self = this;
    document.getElementById('icDiffGroup').addEventListener('click', function(e) {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      this.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      self.difficulty = parseInt(btn.dataset.diff);
      saveDifficulty('chess', self.difficulty);
      if (self.moveHistory.length > 0) self.newGame();
    });
  }

  getCapturedHTML() {
    const sortP = p => [...p].sort((a,b)=>IC_VALUES[b.type]-IC_VALUES[a.type]);
    const toHTML = (arr, cls) => sortP(arr).map(p => `<span class="${cls}">${this._getPieceChar(p.type, p.side)}</span>`).join('') || '<span class="empty-hint">暂无</span>';
    return `<div class="captured-group"><div class="captured-label"><span class="dot red-dot"></span> 白方吃子</div>
      <div class="captured-intl">${toHTML(this.capturedByWhite, 'captured-piece black-piece')}</div></div>
      <div class="captured-group"><div class="captured-label"><span class="dot black-dot"></span> 黑方吃子</div>
      <div class="captured-intl">${toHTML(this.capturedByBlack, 'captured-piece red-piece')}</div></div>`;
  }

  getStatusText() {
    if (this.gameOver) return this.gameResult;
    if (this.aiThinking) return '电脑思考中…';
    if (this.selectedPiece) return '请点击目标位置走棋';
    if (this.multiplayer) {
      const mySideNum = this.mySide === 'white' ? IC_WHITE : IC_BLACK;
      const isMyTurn = this.currentTurn === mySideNum;
      return this.currentTurn === IC_WHITE ? `白方走棋${isMyTurn ? ' (你)' : ' (对手)'}` : `黑方走棋${isMyTurn ? ' (你)' : ' (对手)'}`;
    }
    return this.currentTurn === IC_WHITE ? '白方走棋' : '黑方走棋 (AI)';
  }
  getHintText() { return '点击己方棋子选中 · 点击目标位置走棋 · 兵到底线自动升变'; }
  cleanup() {}
}

