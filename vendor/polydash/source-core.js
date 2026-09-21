/*
 * PolyDash source-derived gameplay core for Lab Dash.
 * Upstream commit: 8013c933980c1f31eb0aa95d101993c525d0e09f
 * BSD-3-Clause; see LICENSE and MODIFICATIONS.md in this directory.
 *
 * This file preserves the upstream geometry, SAT collision, hero movement,
 * grid, and complete level-one builder. Browser drawing, DOM input, timers,
 * audio, restart flow, and save-position code were removed for host control.
 */
//Inspired By games like Mario and Geometry Dash.

function positivMod(n, mod) {
    return ((n % mod) + mod) % mod;
  }
  
  function keepNDec(x, nDec) {
    /*  "round" a number to its nDec decimal */
  
    return Math.round(x * 10 ** nDec) / 10 ** nDec;
  }
  
  class point {
    constructor(x, y) {
      /* Point are coded ny their two coordinates */
      this.x = x;
      this.y = y;
    }
  
    copy() {
      return new point(this.x, this.y);
    }
  
    sameAbsciss(other) {
      /* return true if this and other have the same abscissa */
      return this.x === other.x;
    }
  
    sameOrdinate(other) {
      /* return true if this and other have the same ordinate */
      return this.y === other.y;
    }
  
    equal(other) {
      /* return trus if this and other are equal (same abscissa and odinate) */
      return this.sameAbsciss(other) && this.sameOrdinate(other);
    }
  
    distance(other) {
      /* return the distance between this and other */
      return Math.sqrt((this.x - other.y) ** 2 + (this.y - other.y) ** 2);
    }
  
    addVector(v) {
      /* compute a new point which is the sum of this and a vector v. v is an elemnt of class vector */
      let res = new point(this.x + v.x, this.y + v.y);
      return res;
    }
  
    translate(v) {
      /*  translate point this of vector v. contrary to addVector : the method change directly
                the attribute of the point and return nothing */
      this.x += v.x;
      this.x = keepNDec(this.x, 10);
      this.y += v.y;
      this.y = keepNDec(this.y, 10);
    }
  }
  
  class vector {
    constructor(M, N) {
      /*  M and N can be : 
                - two points, in that case, vector coordinate are Difference of N and M coordinates
                - two coordinates
            */
      if (M instanceof point) {
        this.x = N.x - M.x;
        this.y = N.y - M.y;
      } else {
        /* vectors are coded ny their two coordinates */
        this.x = M;
        this.y = N;
      }
    }
  
    is0() {
      /* return true if the vector is null vector */
      return this.x === 0 && this.y === 0;
    }
  
    sum(other) {
      /* return the sum of this and another vector v */
      let res = new vector(this.x + other.x, this.y + other.y);
      return res;
    }
  
    product(lambda) {
      /* return the external product of this per lambda*/
      let res = new vector(lambda * this.x, lambda * this.y);
      return res;
    }
  
    scalarProduct(other) {
      /* compute the scalar product of this and other */
      return this.x * other.x + this.y * other.y;
    }
  
    norm() {
      /* compute the norm of this */
      return Math.sqrt(this.scalarProduct(this));
    }
  
    orthogonalVector() {
      /*  Give the unique direct orthongonal vector of this with the same norm */
      let res = new vector(-this.y, this.x);
      return res;
    }
  
    polarCoordinate() {
      /*  Compute the polar coordintes of this */
      return [this.norm(), Math.atan(this.y / this.x)];
    }
  }
  
  class straightLine {
    constructor(point1, element) {
      if (element instanceof point) {
        if (!point1.equal(element)) {
          this.point1 = point1;
          this.point2 = element;
        } else {
          throw "A straight line can't be definied by two identical points";
        }
      } else {
        if (!element.is0()) {
          this.point1 = point1;
          this.point2 = point1.addVector(element);
        } else {
          throw "A straight line can't be definied by a null vector";
        }
      }
    }
  
    equation() {
      /*  return the equation of the straight line on the form of and array od three members. Equation ax+by+c = 0
                is coded by [a,b,c] */
      if (this.point1.sameAbsciss(this.point2)) {
        return [1, 0, -this.point1.x];
      } else {
        let direction =
          (this.point1.y - this.point2.y) / (this.point1.x - this.point2.x);
        let ordinateOrigin = this.point1.y - direction * this.point1.x;
        return [-direction, 1, -ordinateOrigin];
      }
    }
  
    containPoint(point) {
      let equationLine = this.equation();
      return (
        keepNDec(
          equationLine[0] * point.x + equationLine[1] * point.y + equationLine[2],
          10
        ) === 0
      );
    }
  }
  
  class segment {
    constructor(point1, point2) {
      this.point1 = point1;
      this.point2 = point2;
    }
  
    center() {
      /* return the center of the segment */
      let res = new point(
        (this.point1.x + this.point2.x) / 2,
        (this.point1.y + this.point2.y) / 2
      );
      return res;
    }
  
    containPoint(point) {
      let vector1 = new vector(this.point1, this.point2);
      let vector2 = new vector(this.point1, point);
  
      let scalarProd1 = vector1.scalarProduct(vector2);
      let scalarProd2 = vector1.scalarProduct(vector1);
  
      return scalarProd1 >= 0 && scalarProd1 <= scalarProd2;
    }
  
    intersect(other) {
      let segmentVector = new vector(this.point1, this.point2);
      let vector1 = new vector(this.point1, other.point1);
      let vector2 = new vector(this.point1, other.point2);
      let vector3 = new vector(this.point2, other.point1);
      let vector4 = new vector(this.point2, other.point2);
  
      let scalarProd1 = segmentVector.scalarProduct(vector1);
      let scalarProd2 = segmentVector.scalarProduct(vector2);
      let scalarProd3 = segmentVector.scalarProduct(vector3);
      let scalarProd4 = segmentVector.scalarProduct(vector4);
  
      return !(
        (scalarProd1 < 0 && scalarProd2 < 0) ||
        (scalarProd3 > 0 && scalarProd4 > 0)
      );
    }
  }
  
  class polygon {
    constructor(vertices) {
      this.vertices = vertices;
    }
  
    copy() {
      let newPolygon = new polygon([]);
      this.vertices.forEach((point) => {
        newPolygon.push(point.copy());
      });
      return newPolygon;
    }
  
    translate(translationVector) {
      /*  tranlaction of the polygon of vector v. Methods don't return new polygon, but modify directly the attributes*/
      this.vertices.forEach((point) => {
        point.translate(translationVector);
      });
    }
  
    edges() {
      /* return the list of edges of the polygon */
      let edges = [];
      let nbVertices = this.vertices.length;
      if (nbVertices > 2) {
        for (let k = 0; k < nbVertices; k++) {
          let edge = new segment(
            this.vertices[k],
            this.vertices[(k + 1) % nbVertices]
          );
          edges.push(edge);
        }
      } else {
        let edge = new segment(this.vertices[0], this.vertices[1]);
        edges.push(edge);
      }
      return edges;
    }
  
    isoBarycenter() {
      /* return ths isoBarycenter (with coefficients = 1) of the polygon */
      let barycenterAbscissa = 0;
      let barycenterOrdinate = 0;
      this.vertices.forEach((point) => {
        barycenterAbscissa += point.x;
        barycenterOrdinate += point.y;
      });
  
      let res = new point(
        (1 / this.vertices.length) * barycenterAbscissa,
        (1 / this.vertices.length) * barycenterOrdinate
      );
      return res;
    }
  
    static separation(other, edge, barycenter) {
      let otherNbVertices = other.vertices.length;
      let segmentLine = new straightLine(edge.point1, edge.point2);
      let equation = segmentLine.equation();
  
      let thisSide =
        equation[0] * barycenter.x + equation[1] * barycenter.y + equation[2];
  
      let pointSideSet = [];
      let pointSide = [];
  
      let pointOnSepartor = [];
  
      for (let k = 0; k < otherNbVertices; k++) {
        pointSide =
          equation[0] * other.vertices[k].x +
          equation[1] * other.vertices[k].y +
          equation[2];
        pointSideSet.push(pointSide);
        if (keepNDec(pointSide, 10) === 0) {
          pointOnSepartor.push(other.vertices[k]);
        }
      }
  
      let commonPoint = false;
      if (pointOnSepartor.length == 1) {
        if (edge.containPoint(pointOnSepartor[0])) {
          commonPoint = true;
        }
      } else if (pointOnSepartor.length == 2) {
        let alignSegment = new segment(pointOnSepartor[0], pointOnSepartor[1]);
        if (edge.intersect(alignSegment)) {
          commonPoint = true;
        }
      }
  
      if (commonPoint) {
        return false;
      } else {
        let minPointSide = Math.min.apply(Math, pointSideSet);
        let maxPointSide = Math.max.apply(Math, pointSideSet);
  
        if (keepNDec(thisSide, 10) == 0) {
          return keepNDec(minPointSide, 10) * keepNDec(maxPointSide, 10) >= 0;
        } else {
          return (
            keepNDec(thisSide, 10) * keepNDec(maxPointSide, 10) <= 0 &&
            keepNDec(minPointSide, 10) * keepNDec(thisSide, 10) <= 0
          );
        }
      }
    }
  
    sat(other) {
      /*  Separating Axes Theorem (S. Gottschalk. Separating axis theorem. Technical Report TR96-024,Department
            of Computer Science, UNC Chapel Hill, 1996) : 
                Two convex polytopes are disjoint iff there exists a separating axis orthogonal 
                to a face of either polytope or orthogonal to an edge from each polytope.
                
            Our version of sat can also sepate segments which are degenerate polygons.
    
            Be carrefull : work only for convex polygons.
         */
  
      let thisEdges = this.edges();
      let otherEdges = other.edges();
  
      let thisBarycenter = this.isoBarycenter();
      let otherBarycenter = other.isoBarycenter();
  
      let isSeparated = false;
      let cpt = 0;
      do {
        /* try to find a separator wicth edge of this */
        isSeparated = polygon.separation(other, thisEdges[cpt], thisBarycenter);
        cpt++;
      } while ((cpt < thisEdges.length) & !isSeparated);
  
      if (!isSeparated) {
        /* if no edges of this ae separting, one try with edges of other */
        cpt = 0;
        do {
          isSeparated = polygon.separation(
            this,
            otherEdges[cpt],
            otherBarycenter
          );
          cpt++;
        } while ((cpt < otherEdges.length) & !isSeparated);
      }
  
      return isSeparated;
    }
  }
  
  class square extends polygon {
    /*  A square extend polygon class. Square attributes are
            - a set of 4 points
            - a center : the barycenter of the square 
            - a direction which is polar coordinates of the first edge of the square.
            Two last attribute are commod in order to rotate the square according to its center.*/
    constructor(element1, element2) {
      /*  there is tw way to constructs a square : 
                - Given the coordinates of the two limit point of one of its edge. In this case, the other point 
                are construct in direct order : edge 2 direction is edge 1 direction rotate from pi/2
                - given its center and the polar coordinates of one of its edge. In this case, the other point 
                are construct in direct order : edge 2 direction is edge 1 direction rotate from pi/2. polar coordinate
                is an array of a positive number (the length of the edge), and an angle in randiant*/
      let point1;
      let point2;
      let point3;
      let point4;
  
      let direction;
      let polarDirection;
      let diagonal;
      let center;
  
      if (element2 instanceof point) {
        point1 = element1;
        point2 = element2;
        direction = new vector(point1, point2);
        polarDirection = direction.polarCoordinate();
        point3 = point2.addVector(direction.orthogonalVector());
        point4 = point3.addVector(
          direction.orthogonalVector().orthogonalVector()
        );
        diagonal = new segment(point1, point3);
        center = diagonal.center();
      } else {
        polarDirection = element2;
        direction = new vector(
          polarDirection[0] * Math.cos(polarDirection[1]),
          polarDirection[0] * Math.sin(polarDirection[1])
        );
        // create a first square with good direction, and first point = (0,0)
        point1 = new point(0, 0);
        point2 = point1.addVector(direction);
        point3 = point2.addVector(direction.orthogonalVector());
        point4 = point3.addVector(
          direction.orthogonalVector().orthogonalVector()
        );
  
        // translate the square to the good position
        diagonal = new segment(point1, point3);
        let initialCenter = diagonal.center();
        center = element1;
        let translationVector = new vector(initialCenter, center);
  
        point1.translate(translationVector);
        point2.translate(translationVector);
        point3.translate(translationVector);
        point4.translate(translationVector);
      }
      super([point1, point2, point3, point4]);
      this.center = center;
      this.polarDirection = polarDirection;
    }
  
    copy() {
      let newSquare = new square([
        this.vertices[0].copy(),
        this.vertices[0].copy(),
      ]);
      newSquare.center = this.center.copy();
      newSquare.polarDirection = this.polarDirection.slice();
      return newSquare;
    }
  
    rotate(angle) {
      /* rotate the square according to its center. angle is in radiant */
      this.polarDirection[1] += angle;
      let direction = new vector(
        this.polarDirection[0] * Math.cos(this.polarDirection[1]),
        this.polarDirection[0] * Math.sin(this.polarDirection[1])
      );
  
      this.vertices[0] = new point(0, 0);
      this.vertices[1] = this.vertices[0].addVector(direction);
      this.vertices[2] = this.vertices[1].addVector(direction.orthogonalVector());
      this.vertices[3] = this.vertices[2].addVector(
        direction.orthogonalVector().orthogonalVector()
      );
  
      let diagonal = new segment(this.vertices[0], this.vertices[2]);
      let initialCenter = diagonal.center();
      let translationVector = new vector(initialCenter, this.center);
  
      this.vertices[0].translate(translationVector);
      this.vertices[1].translate(translationVector);
      this.vertices[2].translate(translationVector);
      this.vertices[3].translate(translationVector);
    }
  
    translate(transactionVector) {
      // extend class translate of polygon by translative square center plus the points or the polygon
      super.translate(transactionVector);
      this.center.translate(transactionVector);
    }
  
    getLowestPointIndex() {
      // indicate the index of the point(s) of minimal ordinates of the the square. If two points, we return
      // first the point with lowest abscissa.
      let lowestPoint = new point(Infinity, Infinity);
  
      for (let k = 0; k < this.vertices.length; k++) {
        if (keepNDec(this.vertices[k].y, 6) < keepNDec(lowestPoint.y, 6)) {
          // comparision are mad with 6 decimal to avoid precision error of java script
          lowestPoint = this.vertices[k];
        }
      }
  
      let res = [];
      for (let k = 0; k < this.vertices.length; k++) {
        if (keepNDec(lowestPoint.y, 6) === keepNDec(this.vertices[k].y, 6)) {
          // comparision are mad with 6 decimal to avoid precision error of java script
          res.push(k);
        }
      }
  
      if (res.length == 2) {
        // return lowest point by abscissa order
        if (this.vertices[res[0]].x > this.vertices[res[1]].x) {
          res = [res[1], res[0]];
        }
      }
  
      return res;
    }
  }
  
  /*****************************************************************************************
     *  Games elements classes 
     * 
     *  I have organize the game in three principal elements : 
     *  - the heros element : on class which contains all the method of hero
     *  - the grid element which contain all elements about the level. There is more than one 
     *    class : some small class for element as peak or platform, and a class grid
    /*****************************************************************************************
    
        /*  Hero
        
            One classe which contains all methods to manage the hero. It espaciallycontains method
            move which compute new position of the hero after a frame.
        */
  
  class hero {
    constructor(
      positionCenter,
      positionPolarCoordinates,
      vx,
      vy0,
      xJump,
      yJump,
      g,
      t,
      isJumping
    ) {
      /*  a hero is the set of a body which is a square, and foot which will be usefull to test if the hero land
                on a block (the foot touch the roof of the block) or not. foot is and array of segments declared a 
                polygon to apply them sat algorithm. If the square is horizontal, the array contains only one segment : the 
                lowest, else it contains two segments : those around the lowest point */
  
      /*  Body hitBox */
      let intialPosition = new point(positionCenter[0], positionCenter[1]);
      this.body = new square(intialPosition, positionPolarCoordinates.slice());
  
      /*  foot hitBox */
      let footPoint = this.body.getLowestPointIndex();
      if (footPoint.length == 2) {
        // In that case, the first point of the foot if the leftest because of mthode getLowestPointIndex
        let footPoint1 = this.body.vertices[footPoint[0]].copy();
        let footPoint2 = this.body.vertices[footPoint[1]].copy();
        let foot1 = new polygon([footPoint1, footPoint2]);
        this.foot = [foot1];
      } else {
        // In that case, the first point of the two foots is the lowest of the square
        let footPoint1 = this.body.vertices[footPoint[0]].copy();
        let footPoint2 =
          this.body.vertices[positivMod(footPoint[0] + 1, 4)].copy();
        let footPoint3 =
          this.body.vertices[positivMod(footPoint[0] - 1, 4)].copy();
        let foot1 = new polygon([footPoint1, footPoint2]);
        let foot2 = new polygon([footPoint1.copy(), footPoint3]);
        this.foot = [foot1, foot2];
      }
  
      /*  Physical attributes 
    
                Those parameters are computed in order the hero do a jump of xJump unity heigh and yJump unity long. 
                We use classical newtonian physic for the trajectories which says that he gravity center of the hero 
                follow the next trajectory (with t=0 as begning of a jump)
                    x(t) = vx * t
                    y(t) = -1/2*g*t^2 + vy0 * t + y0
                where 
                    - vx is the horizontal speed or the hero : in the game it is a constant, so no need to take vx(0)
                    - g id the gravitional constant
                    - vy0 is the initial vertical speed when jump.
                    - y0 is the initial y coordinate of the center of the hero
                This formula work equaly when the hero fall from a bloc (in that case vz0=0) and when the hero is on a 
                bloc (in that case, g and vy0 = 0).
                
                On the game, vx is fixed, and we choose g and vy0 so that a jump is xJump long and yJump height. 
                xJump and yJump are fixed too
            */
  
      this.vx = vx; // horizontal speed of the hero
      this.vy0 = vy0; // vertical speed. when jump :  (2*this.zJump)/((this.xJump/(2*this.vx))
      this.xJump = xJump; // length of a jump
      this.yJump = yJump; // height of a jump
      this.g = g; // gravitional constant. value when jump or fall from a platform : (2*this.zJump)/((this.xJump/(2*this.vx))**2) ;
      this.t = t; // counter of time when the hero begin jumping or falling in order to use equation. must be 0 at the begning of a jump or fall
      this.isJumping = isJumping;
      // use to avoid the gamer to do multiple jump, when jump, it become true and become false only when the hero land
      this.startJumpPosition = this.body.center.copy();
  
      /*  hero status 
            
                code différent important state of the hero
            */
  
      this.hasStarted = false; // if the game has not started
      this.isDead = false; // for game over
      this.haveFinished = false; // for win
  
      /*  For hero death animation 
            
                When the hero die, it become a set of particle. Those particles re set in setParticules method    
            */
  
      this.deathParticle = [];
    }
  
    rotate(angle) {
      /* rotate the hero : body + foot */
      this.body.rotate(angle);
  
      let footPoint = this.body.getLowestPointIndex();
      if (footPoint.length == 2) {
        let footPoint1 = this.body.vertices[footPoint[0]].copy();
        let footPoint2 = this.body.vertices[footPoint[1]].copy();
        let foot1 = new polygon([footPoint1, footPoint2]);
        this.foot = [foot1];
      } else {
        let footPoint1 = this.body.vertices[footPoint[0]].copy();
        let footPoint2 =
          this.body.vertices[positivMod(footPoint[0] + 1, 4)].copy();
        let footPoint3 =
          this.body.vertices[positivMod(footPoint[0] - 1, 4)].copy();
        let foot1 = new polygon([footPoint1, footPoint2]);
        let foot2 = new polygon([footPoint1.copy(), footPoint3]);
        this.foot = [foot1, foot2];
      }
    }
  
    translate(transactionVector) {
      /* translate the hero : body + foot */
      this.body.translate(transactionVector);
      this.foot.forEach((footValue) => {
        footValue.translate(transactionVector);
      });
    }
  
    footContactWithRoof(previousFoot, platformInstance) {
      /*  Compute collision to know if the hero has land. The hero land on a platform if its foots have collisioned (do that word exists ?)
                with platforms roof (see class plateform). However, because the game is not continuous but dicrete, and 
                that roof and foot are lines, it could arive that at t, foot is above a roof and a t+1, it is below. In that
                case, the game will consider there is no collision. To avoid that. We construct a footPolygon which is the 
                polygon obtain by contatenate previous foot position and next foot position. Thank to that, if
                footPolygon have collision wich the roof, it means that bettween t and t+1, the hero have land on the roof. */
  
      let cpt = 0; // if at the end cpt > 0, there is a contact
  
      let footPolygon;
      for (let k = 0; k < this.foot.length; k++) {
        let lineTest = new straightLine(
          this.foot[k].vertices[1],
          previousFoot[k][0]
        );
        /*  Test if roof polygon is flat. In that case, footPolygon is a segment, and in order sat method of polygon work
                    one need to keep only two points. sat work only if there is no more than two points align in polygon*/
        if (lineTest.containPoint(previousFoot[k][1])) {
          footPolygon = new polygon([
            this.foot[k].vertices[1],
            previousFoot[k][0],
          ]);
          /*  only arrive when the hero have rectiling movment : when it is horizontal and placed on the ground.
                        In that case, foot have only one element and first point of the polygon is the leftest. So the segment
                        as defined is the larger possible segment*/
        } else {
          footPolygon = new polygon([
            this.foot[k].vertices[0],
            this.foot[k].vertices[1],
            previousFoot[k][1],
            previousFoot[k][0],
          ]);
        }
        /*  the order of point is important. When moving, each point is translate from the same vector, so we need 
                    to choose order of the point to not have cross polygon */
        if (!footPolygon.sat(platformInstance.roof)) {
          /* if one collision : it means that the hero land, we conslude verifying cpt > 0 */
          cpt++;
        }
      }
  
      return cpt > 0;
    }
  
    move(gridInstance) {
      /*  The gravity center of the hero follow the next trajectory (with t=0 as begning of a jump)
                    x(t) = vx * t
                    y(t) = -1/2*g*t^2 + vy0 * t + y0
                where 
                    - vx is the horizontal speed or the hero : in the game it is a constant, so no need to take vx(0)
                    - g id the gravitaional constant
                    - vy0 is the initial vertical speed when jump.
                    - y0 is the initial y coordinate of the center of the hero
                This formula work equaly when the hero fall from a bloc (in that case vz0=0) and when the heri is on a bloc (in that case, g and vy0 = 0).
    
                On this methode, we consider finite diffrecne of this equation : y(t+dt) - y(t) and x(t+dt) - x(t). Because of the
                quadratiq nature of equation 2, the time t still appears in equation for y, and so we can't keep only dt value, we 
                need to use t.
                
                On the game, vx is fixed, and we choose g and vz0 so that a jump is xJump long and yJump height. xJump and zJump are fixed too
    
                See grid class to know what is gridInstance
                */
  
      let previousFoot = [];
      this.foot.forEach((foot) => {
        previousFoot.push([foot.vertices[0].copy(), foot.vertices[1].copy()]);
      });
      // save previous foot to verify if the hero land (see method footContactWithRoof)
  
      let tSauv = this.t;
      let yPosSauv = this.body.center.y;
      let xPosSauv = this.body.center.x;
      // use to rectify position when landing
  
      let dt = frameTimeDiff.dt;
      // time interval between to frames
  
      let translationVector = new vector(
        this.vx * dt,
        Math.max((-1 / 2) * this.g * dt * (2 * this.t + dt) + this.vy0 * dt, -1)
      );
      // limit y-translation to avoid the hero to go throught the floor
  
      this.translate(translationVector);
      // translate the hero with finite diffrence equation
  
      this.t += dt;
      //  for next step, t become t+dt. If the movement is not a jump or a fall, t will be set to 0 next. Indeed
      //    t is not mandatory for rectilign horizontal movement, and that way, t will be 0 at the begning of a jump
      //    or a fall as expected.*/
  
      /*  Grid interaction check : We test collision of the hero with its neihbourg envirenement. 
                - collision with a peak = dead
                - collision with a platform = dead if not collisions with the floor of the platform
            */
  
      //  Some times, the hero could touch for example a roof and a peak but the peak is same level (or above
      //  because of discret nature of a game). In that case, the user don't loose. To check that, we introduce
      //  the two following arrays
      let deadContactElementCenter = [];
      //  if touch a death element, we add in that array the value of the center of element. At the end, if the
      //  hero didn't touch a floor above those coordintes, the hero die
      let floorContactElementCenter = [];
      //  if touch a floor element, we add in that array the value of the center of element. At the end, if the
      //  hero didn't touch a floor above those coordintes, the hero die
  
      let aroundGrid = gridInstance.grid.slice(
        Math.max(Math.floor(this.body.center.x - 1), 0),
        Math.floor(this.body.center.x + 2)
      );
      // only test element that the hero can touch, ie elemnts in the neighbourhood
  
      aroundGrid.forEach((col) => {
        // one test contact for each potential elements
        if (col != undefined) {
          // if columns grid is empty
          col.forEach((element) => {
            if (element instanceof platform) {
              if (!this.body.sat(element.platform)) {
                // if touch platform, test if touch the roof : if yes, we add an element in floorContactElementCenter,
                // else in deadContactElementCenter
                if (this.footContactWithRoof(previousFoot, element)) {
                  floorContactElementCenter.push(element.platform.center.y);
                } else {
                  deadContactElementCenter.push(element.platform.center.y);
                }
              }
            } else if (element instanceof peak) {
              // if touch peak, it's always a dead contact
              if (!this.body.sat(element.peak)) {
                deadContactElementCenter.push(element.center.y);
              }
            } else if (element instanceof ending) {
              // if touch finish, it's the end
              if (!this.body.sat(element.ending)) {
                this.haveFinished = true;
              }
            }
          });
        }
      });
  
      let maxDeadContactCenter, maxFloorContactCenter;
      //  max of the deadContactElementCenter and floorContactElementCenter. if maxFloorContactCenter > maxDeadContactCenter
      //  it's not game over, else it is
  
      if (deadContactElementCenter.length > 0) {
        maxDeadContactCenter = deadContactElementCenter.reduce(function (a, b) {
          return Math.max(a, b);
        });
      } else {
        maxDeadContactCenter = -Infinity;
      }
  
      if (floorContactElementCenter.length > 0) {
        maxFloorContactCenter = floorContactElementCenter.reduce(function (a, b) {
          return Math.max(a, b);
        });
      } else {
        maxFloorContactCenter = -Infinity;
      }
  
      if (deadContactElementCenter.length > 0) {
        if (floorContactElementCenter.length === 0) {
          this.isDead = true;
        } else {
          if (maxDeadContactCenter > maxFloorContactCenter) {
            this.isDead = true;
          }
        }
      }
  
      if (this.body.center.y < 0) {
        /*  The lower set of roof have coordinate 1, if the square fall under it, it means that it falls in a hole */
        this.isDead = true;
        let newCenter = new point(this.body.center.x, 0.5);
        let translateVector = new vector(this.body.center, newCenter);
        this.translate(translateVector);
      }
  
      if (!this.isDead) {
        if (floorContactElementCenter.length > 0) {
          // begin by adjust x position of the hero when contact
          let newXPosition;
          if (this.isJumping) {
            // If landing, the hero could be below the roof. We begin by rectify its position in searching dt such
            // the ordintate hero psition when landing is maxFloorContactCenter+1 y positin
            let a = -this.g / 2;
            let b = this.vy0 - this.g * tSauv;
            let c = -(maxFloorContactCenter + 1 - yPosSauv);
            let delta = b ** 2 - 4 * a * c;
            let newDt = Math.max(
              (-b - Math.sqrt(delta)) / (2 * a),
              (-b + Math.sqrt(delta)) / (2 * a)
            );
  
            newXPosition = xPosSauv + newDt * this.vx;
          } else {
            // if just moving, no modification
            newXPosition = this.body.center.x;
          }
  
          let newCenter = new point(newXPosition, maxFloorContactCenter + 1);
          let translateVector = new vector(this.body.center, newCenter);
          this.translate(translateVector);
          // if the hero if below the roof, e replace it on it
  
          this.rotate(2 * Math.PI - this.body.polarDirection[1]);
          // if the hero is rotated, we reput it right
  
          this.g = 0; // g is compensated by newton 3rd law
          this.vy0 = 0; // the vertical movment stop
          this.t = 0; // t is not mandatory in equation anymore, and will be 0 at the begning of a jump or a fall
          this.isJumping = false; // the gamer can jump
        } else {
          this.g = (2 * this.yJump) / (this.xJump / (2 * this.vx)) ** 2; // no compensation by newton 3rd law
          this.rotate(
            -Math.PI / (((1 / frameTimeDiff.dt) * this.xJump) / (2 * this.vx) + 2)
          ); // to look pretty : the hero rotate when not on a roof
          this.isJumping = true; // can't jump before the end of the jump /fall
        }
      }
    }
  
    jump() {
      /* Modify physical constant in order to the next move (methode move) is a jump */
      if (!this.isJumping) {
        this.isJumping = true; // during a jump, the hero can't jump anymore
        // can't jump if already jumping
        this.g = (2 * this.yJump) / (this.xJump / (2 * this.vx)) ** 2; // no compensation by newton 3rd law
        this.vy0 = (2 * this.yJump) / (this.xJump / (2 * this.vx)); // to look pretty : the hero rotate when not on a roof
        this.t = 0; // at the begning of a jump, t must be = 0 in order to the equation are ok
        this.startJumpPosition = this.body.center.copy();
      }
    }
  
    setDeathParticle() {
      /*  When death, create explosion particles */
      for (let k = 0; k < 40; k++) {
        this.deathParticle.push({
          position: this.body.center.copy(),
          angle: 2 * Math.PI * Math.random(),
          maxProjection: 2 * Math.random(),
        });
      }
    }
  }
  
  /*  Level elements : 
            
            3 kinds of grid elements: 
            - platform on which one can land, or crash if foot hero don't touch platform roof
            - peak on which one can die
            - ending
        */
  
  class platform {
    /*  A platform is 
             -  a square of edge length 1 and angle 0. 
             -  the the roof which is the upper edge of the square. It is used to verify if the hero land on the platforme : 
                the foot and the roof enter in collision, or not (in that case, if collision, it's game over)
                
            For each element one add col = floor(x-positon) attribute. Elements will 
            be organized on a grid which is an array. In array cell n, we will place all 
            element which col = n. That way, it is easy to get all element of the neibourhood
            of the hero to test collisions
        */
    constructor(x, y) {
      /* x,y are the coordinates of the lowest leftest point of the platform */
      this.col = Math.floor(x);
      let platformCenter = new point(x + 1 / 2, y + 1 / 2);
      this.platform = new square(platformCenter, [1, 0]);
      this.roof = new polygon([
        this.platform.vertices[2],
        this.platform.vertices[3],
      ]);
    }
  }
  
  class peak {
    /*  peak is a triangle. There is 4 kind of peak according to there orientation.
            
            For each element one add col = floor(x-positon) attribute. Elements will 
            be organized on a grid which is an array. In array cell n, we will place all 
            element which col = n. That way, it is easy to get all element of the neibourhood
            of the hero to test collisions
        */
    constructor(x, y, orientation) {
      /* x, y are the coordinates of the lowest leftest point of the square in which the triangle is inscribed */
      let point1, point2, point3;
      switch (orientation) {
        case "up":
          point1 = new point(x, y);
          point2 = new point(x + 1, y);
          point3 = new point(x + 1 / 2, y + 1);
          break;
        case "down":
          point1 = new point(x, y + 1);
          point2 = new point(x + 1, y + 1);
          point3 = new point(x + 1 / 2, y);
          break;
        case "left":
          point1 = new point(x + 1, y + 1);
          point2 = new point(x + 1, y);
          point3 = new point(x, y + 1 / 2);
          break;
        case "right":
          point1 = new point(x, y + 1);
          point2 = new point(x, y);
          point3 = new point(x + 1, y + 1 / 2);
          break;
      }
      this.col = Math.floor(x);
      this.peak = new polygon([point1, point2, point3]);
      this.center = new point(x + 1 / 2, y + 1 / 2);
    }
  }
  
  class ending {
    /*  Ending is a unique element which indicate the end of the level
            
            For each element one add col = floor(x-positon) attribute. Elements will 
            be organized on a grid which is an array. In array cell n, we will place all 
            element which col = n. That way, it is easy to get all element of the neibourhood
            of the hero to test collisions
        */
    constructor(position) {
      /* Ending hitbox is a rectangle horizontal of width 1 and height 10. Position is the abscissa of left edge  */
      let point1 = new point(position, 0);
      let point2 = new point(position + 1, 0);
      let point3 = new point(position + 1, 10);
      let point4 = new point(position, 10);
  
      this.ending = new polygon([point1, point2, point3, point4]);
      this.col = Math.floor(position);
    }
  }
  
  class grid {
    /*  grid is a discretisation of the level. All element have a col value which is the floor of there x-position.
             Those element will be organized on the grid which is an array. In array cell n, we will place all element
            which col = n. That way, it is easy to get all element of the neibourhood
            of the hero to test collisions*/
  
    constructor() {
      /* by default a grid is empty, we add element using methodes */
      this.grid = [];
    }
  
    addPlatform(x, y) {
      let platformInstance = new platform(x, y);
      /*  Given a platform, place a platform in the grid */
      if (this.grid[platformInstance.col] != undefined) {
        this.grid[platformInstance.col].push(platformInstance);
      } else {
        this.grid[platformInstance.col] = [platformInstance];
      }
  
      return [x, y];
    }
  
    addPeak(x, y, direction) {
      let peakInstance = new peak(x, y, direction);
      /*  Given a peak, place a platform in the grid */
      if (this.grid[peakInstance.col] != undefined) {
        this.grid[peakInstance.col].push(peakInstance);
      } else {
        this.grid[peakInstance.col] = [peakInstance];
      }
  
      return [x, y];
    }
  
    addEnding(endingInstance) {
      /*  Given a ending, place a platform in the grid */
      if (this.grid[endingInstance.col] != undefined) {
        this.grid[endingInstance.col].push(endingInstance);
      } else {
        this.grid[endingInstance.col] = [endingInstance];
      }
    }
  
    removeCol(start, end) {
      /* remove the entire element of grid from col start to col end exclude (begning by 0) */
      for (let k = start; k < end; k++) {
        this.grid[k] = undefined;
      }
    }
  
    defaultGrid(size) {
      /* create a default frid with a default ground of platform on first row. */
      this.grid = [];
      for (let k = 4; k < size; k++) {
        this.addPlatform(k, 4);
      }
    }
  }

  // Replaces the upstream wall-clock frame object. The host supplies exactly
  // one deterministic step value before invoking hero.move().
  const frameTimeDiff = { dt: 0 };
  /*  Level construction
    
            Function which make level disign of levels. Now, only one level : the user can't choose, but maybe in futur
        */
  
  function platformDistance(h, heroInstance) {
    /*  h is the differnce of height between two successive platform . the function return the optimal distance
            between the two in order to be able to chain jump*/
    let a =
      -(2 * heroInstance.yJump) /
      (heroInstance.xJump / (2 * heroInstance.vx)) ** 2 /
      2;
    let b =
      (2 * heroInstance.yJump) / (heroInstance.xJump / (2 * heroInstance.vx));
    let delta = b ** 2 + 4 * a * h;
  
    return ((-b - Math.sqrt(delta)) / (2 * a)) * heroInstance.vx;
  }
  
  function level1(gridInstance, heroInstance) {
    gridInstance.grid = [];
  
    let d1 = platformDistance(1, heroInstance);
    let d2 = platformDistance(2, heroInstance);
    let d27 = platformDistance(2.7, heroInstance);
    let d0 = 4;
    let dMoins1 = platformDistance(-1, heroInstance);
  
    let pos;
    let lastPos;
  
    for (let k = 0; k < 70; k++) {
      gridInstance.addPlatform(k, 4);
    }
  
    for (let k = 70; k < 110; k++) {
      gridInstance.addPlatform(k, 4);
      if ((k - 70) % 8 === 0) {
        pos = gridInstance.addPeak(k, 5, "up");
      }
    }
    lastPos = pos;
  
    for (let k = 0; k < 8; k++) {
      pos = gridInstance.addPlatform(Math.floor(30 + lastPos[0]) + d0 * k, 5);
    }
  
    for (let k = 110; k < 188; k++) {
      pos = gridInstance.addPlatform(k, 4);
    }
  
    lastPos = pos;
    for (let k = 0; k < 3; k++) {
      pos = gridInstance.addPlatform(lastPos[0] + d1 * (k + 1), 5 + k);
    }
    pos = gridInstance.addPlatform(pos[0] + d0, 7);
    pos = gridInstance.addPlatform(pos[0] + dMoins1, 6);
    pos = gridInstance.addPlatform(pos[0] + d0, 6);
    pos = gridInstance.addPlatform(pos[0] + d1, 7);
    pos = gridInstance.addPlatform(pos[0] + d0, 7);
    pos = gridInstance.addPlatform(pos[0] + 2.5, 6);
    pos = gridInstance.addPlatform(pos[0] + 2.5, 5);
    for (let k = 0; k < 5; k++) {
      pos = gridInstance.addPlatform(pos[0] + d1, 6 + k);
    }
    for (let k = 0; k < 5; k++) {
      pos = gridInstance.addPlatform(pos[0] + dMoins1, 10 - k);
    }
    for (let k = 0; k < 15; k++) {
      pos = gridInstance.addPlatform(pos[0] + d1, 6 + k);
    }
  
    lastPos = pos;
    for (
      let k = Math.floor(lastPos[0]) + 4;
      k < Math.floor(lastPos[0]) + 24;
      k++
    ) {
      pos = gridInstance.addPlatform(k, 4);
    }
  
    lastPos = pos;
    for (let k = Math.floor(lastPos[0]); k < Math.floor(lastPos[0]) + 10; k++) {
      pos = gridInstance.addPlatform(k, 4);
      pos = gridInstance.addPlatform(k, 7.6);
      pos = gridInstance.addPeak(k, 6.5, "down");
    }
  
    pos = gridInstance.addPeak(pos[0] + 4, 5, "left");
    pos = gridInstance.addPlatform(pos[0] + 1, 5);
    pos = gridInstance.addPlatform(Math.floor(pos[0]) + 1, 4);
    pos = gridInstance.addPeak(pos[0], 5, "right");
  
    lastPos = pos;
    for (let k = Math.floor(lastPos[0]); k < Math.floor(lastPos[0]) + 10; k++) {
      pos = gridInstance.addPlatform(k, 4);
    }
  
    lastPos = pos;
    for (let k = 1; k < 5; k++) {
      pos = gridInstance.addPlatform(lastPos[0] + k * d2, 4 + 2 * k);
    }
    lastPos = pos;
    for (let k = 1; k < 5; k++) {
      pos = gridInstance.addPlatform(lastPos[0] + k * d27, lastPos[1] + 2.7 * k);
    }
  
    pos = gridInstance.addPlatform(pos[0] + d0, pos[1]);
    pos = gridInstance.addPlatform(pos[0] + d0, pos[1]);
    pos = gridInstance.addPlatform(pos[0] + 2.5, pos[1] - 1);
    pos = gridInstance.addPlatform(pos[0] + d1, pos[1] + 1);
    pos = gridInstance.addPlatform(pos[0] + dMoins1, pos[1] - 1);
    pos = gridInstance.addPlatform(pos[0] + 1, pos[1]);
    pos = gridInstance.addPlatform(pos[0] + 1, pos[1]);
    pos = gridInstance.addPlatform(pos[0] + 1, pos[1]);
    pos = gridInstance.addPlatform(pos[0] + 1, pos[1]);
    pos = gridInstance.addPeak(pos[0], pos[1] + 1, "up");
    pos = gridInstance.addPlatform(pos[0] + dMoins1 - 1, pos[1] - 2);
    pos = gridInstance.addPlatform(pos[0] + 2.5, pos[1] - 1);
    pos = gridInstance.addPlatform(pos[0] + 2.5, pos[1] - 1);
    pos = gridInstance.addPeak(pos[0] - 1, pos[1] + 3, "left");
    pos = gridInstance.addPlatform(pos[0] + 1 + dMoins1, pos[1] - 4);
    pos = gridInstance.addPlatform(pos[0] + dMoins1, pos[1] - 1);
    pos = gridInstance.addPlatform(pos[0] + 2.5, pos[1] - 1);
    pos = gridInstance.addPlatform(pos[0] + dMoins1, pos[1] - 1);
  
    for (let k = 0; k < 12; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, pos[1] - Math.abs(Math.sin(k)));
    }
  
    lastPos = pos;
    for (let k = lastPos[0] + 1; k < Math.floor(lastPos[0]) + 4; k++) {
      pos = gridInstance.addPlatform(k, lastPos[1]);
    }
  
    //gameParameters.initial[0] = [pos[0]-6, pos[1] + 10] ;
    pos = gridInstance.addPlatform(pos[0] + d0, pos[1]);
  
    let heightVariation;
    heightVariation = 2;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = 2.7;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = -4;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = 1;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = 1.5;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = -1;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = 2.3;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = 1;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = -4;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    heightVariation = -4;
    pos = gridInstance.addPlatform(
      pos[0] + platformDistance(heightVariation, heroInstance),
      pos[1] + heightVariation
    );
    pos = gridInstance.addPlatform(pos[0] + d0, 4);
  
    lastPos = pos;
    for (let k = 1; k < 20; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
  
    pos = gridInstance.addPlatform(pos[0] + 1, 4);
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 5; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 5; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 6; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 4; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 4; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 8; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 1; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 7; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 1; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 3; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 1; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPeak(pos[0], 5, "up");
    for (let k = 0; k < 11; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPlatform(pos[0] + 1, 4.5);
    pos = gridInstance.addPeak(pos[0], 5.5, "up");
    for (let k = 0; k < 5; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPlatform(pos[0] + 1, 4.5);
    pos = gridInstance.addPeak(pos[0], 5.5, "up");
    for (let k = 0; k < 5; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPlatform(pos[0] + 1, 4.5);
    pos = gridInstance.addPeak(pos[0], 5.5, "up");
    for (let k = 0; k < 3; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPlatform(pos[0] + 1, 4.5);
    pos = gridInstance.addPeak(pos[0], 5.5, "up");
    for (let k = 0; k < 8; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPlatform(pos[0] + 1, 5);
    pos = gridInstance.addPeak(pos[0], 6, "up");
  
    for (let k = 0; k < 8; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
    pos = gridInstance.addPlatform(pos[0] + d0, 4);
    pos = gridInstance.addPlatform(pos[0] + d0, 4);
    pos = gridInstance.addPlatform(pos[0] + 1, 4);
    pos = gridInstance.addPlatform(pos[0] + 1, 4);
    pos = gridInstance.addPlatform(pos[0] + 1, 4);
    pos = gridInstance.addPlatform(pos[0] + dMoins1, 3);
    pos = gridInstance.addPlatform(pos[0] + d0, 3);
    pos = gridInstance.addPlatform(pos[0] + dMoins1, 2);
    pos = gridInstance.addPlatform(pos[0] + 1, 2);
    pos = gridInstance.addPlatform(pos[0] + 1, 2);
    pos = gridInstance.addPlatform(pos[0] + 1, 2);
    lastPos = pos;
    for (let k = 0; k < 16; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 2);
    }
    pos = lastPos;
    for (let k = 0; k < 16; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4.3);
    }
  
    for (let l = 2; l < 16; l += 2) {
      lastPos = pos;
      for (let k = 0; k < 3; k++) {
        pos = gridInstance.addPlatform(pos[0] + 1, l);
      }
      pos = gridInstance.addPlatform(pos[0] + 1, l + 2);
      pos = gridInstance.addPlatform(pos[0], l);
      pos = gridInstance.addPlatform(pos[0], l + 1);
      pos = gridInstance.addPlatform(pos[0], l + 2);
      pos = lastPos;
      if (l == 2) {
        pos = gridInstance.addPlatform(pos[0], 5.3 + (l - 2));
      }
      pos = gridInstance.addPlatform(pos[0], 5.3 + (l - 2) + 1);
      for (let k = 0; k < 3; k++) {
        pos = gridInstance.addPlatform(pos[0], 5.3 + (l - 2) + k + 1);
      }
      for (let k = 0; k < 3; k++) {
        pos = gridInstance.addPlatform(pos[0] + 1, 6.3 + l);
        pos = gridInstance.addPeak(pos[0], 5.3 + l, "down");
      }
    }
  
    for (let k = 1; k < 20; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 16);
      pos = gridInstance.addPlatform(pos[0], 20.3);
      pos = gridInstance.addPeak(pos[0], 19.3, "down");
    }
  
    for (let k = 1; k < 40; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 16);
      if (k % 5 === 0) {
        pos = gridInstance.addPeak(pos[0], 17.5, "left");
      }
    }
    for (let k = 1; k < 40; k++) {
      if (k % 5 === 0) {
        pos = gridInstance.addPlatform(pos[0] + d0, 16);
      }
    }
    for (let k = 1; k < 15; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 16);
    }
    for (let k = 1; k < 40; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 16);
      if (k % 5 === 0) {
        lastPos = pos;
        pos = gridInstance.addPeak(pos[0] + Math.sin(k), 17.5, "left");
        pos = gridInstance.addPeak(pos[0] + 0.5, 17.5, "left");
        pos = lastPos;
      }
    }
    for (let k = 1; k < 10; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 16);
    }
    for (let k = 0; k < 20; k++) {
      pos = gridInstance.addPlatform(pos[0] + d1, 16 + k);
    }
    lastPos = pos;
    pos = gridInstance.addPlatform(pos[0] + d1 + 1, pos[1] + 2);
    pos = gridInstance.addPeak(pos[0] - 1, pos[1], "left");
    pos = lastPos;
  
    for (let k = 0; k < 8; k++) {
      pos = gridInstance.addPlatform(pos[0] + 2.5, pos[1] - 1);
    }
    for (let k = 0; k < 60; k++) {
      pos = gridInstance.addPlatform(pos[0] + d1, pos[1] + 1);
    }
  
    pos = gridInstance.addPlatform(pos[0] + 8, pos[1] - 22);
  
    for (let k = 0; k < 7; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, pos[1]);
    }
  
    pos = gridInstance.addPlatform(pos[0] + 8, pos[1] - 22);
  
    for (let k = 0; k < 7; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, pos[1]);
    }
    pos = gridInstance.addPeak(pos[0], pos[1] + 1, "up");
  
    for (let k = 1; k < 15; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
  
    for (let k = 0; k < 40; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
      if (k % 4 === 0) {
        pos = gridInstance.addPeak(pos[0], 5, "up");
      }
    }
  
    for (let k = 0; k < 40; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
      if (k % 8 === 0) {
        pos = gridInstance.addPeak(pos[0], 5, "up");
      }
    }
  
    for (let k = 0; k < 80; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
      if (k % 16 === 0) {
        pos = gridInstance.addPeak(pos[0], 5, "up");
      }
    }
  
    lastPos = pos;
    for (let k = 1; k < 80; k++) {
      pos = gridInstance.addPlatform(pos[0] + 1, 4);
    }
  
    let endingInstance = new ending(Math.floor(lastPos[0]) + 33);
    gridInstance.addEnding(endingInstance);
  }

  module.exports = {
    point,
    vector,
    polygon,
    square,
    hero,
    platform,
    peak,
    ending,
    grid,
    platformDistance,
    level1,
    setSimulationStep(dt) {
      frameTimeDiff.dt = Number(dt) || 0;
    },
  };
