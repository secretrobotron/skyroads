(function() {
  var vec3 = CubicVR.vec3,
      kbd = CubicVR.enums.keyboard;

  var Player = function( options ) {
    options = options || {};

    var graphicsMesh = CubicVR.loadMesh("assets/models/ship-main.xml", "assets/models/"),
        sceneObject = new CubicVR.SceneObject( graphicsMesh );
    
    var mesh = new CubicVR.Mesh();
    var collisionMap = new CubicVR.CollisionMap({
        type: CubicVR.enums.collision.shape.BOX,    // seems to cause less random pop-up jumps
        size: [ 0.4, 0.4, 0.9]
    });
  
    var rigidBody = new CubicVR.RigidBody( sceneObject, {
      type: CubicVR.enums.physics.body.DYNAMIC,
      mass: 1,
      collision: collisionMap,
      resitution: 0.0
    });

    this.canJump = false;

    Object.defineProperty( this, "mesh", { get: function() { return mesh; } } );
    Object.defineProperty( this, "rigidBody", { get: function() { return rigidBody; } } );
    Object.defineProperty( this, "sceneObject", { get: function() { return sceneObject; } } );

    var that = this;
    this.jump = function() {
      if ( that.canJump ) {
        var linV = [0,1.0,0];
        rigidBody.applyImpulse( linV );
        that.canJump = false;
      } //if
    }; //jump

    this.prepare = function( scene, physics, mvc ) {
      scene.bindSceneObject( sceneObject );
      physics.bindRigidBody( rigidBody );
      rigidBody.setAngularFactor(0);
      rigidBody.activate();
      sceneObject.addEvent({
        id: CubicVR.enums.event.TICK,
        interval: 1.0/30.0,
        properties: {
        },
        action: function( event ) {
          var linV = rigidBody.getLinearVelocity();
          
          if (sceneObject.position[1] >= -0.5) {
              if ( mvc.isKeyPressed( kbd.KEY_D ) ) {
                linV[ 0 ] = Math.min( 5.0, linV[ 0 ] + 1.0 );
              }
              if ( mvc.isKeyPressed( kbd.KEY_A ) ) {
                linV[ 0 ] = Math.max( -10.0, linV[ 0 ] - 1.6 );
              }
              if ( mvc.isKeyPressed( kbd.KEY_W ) ) {
                linV[ 2 ] = Math.min( 1.0, linV[ 2 ] - 0.15 );
              }
              linV[ 0 ] -= linV[ 0 ] *.2;
              if (!rigidBody.isActive()) rigidBody.activate();
              rigidBody.setLinearVelocity( linV );
          }

          rigidBody.setCollisionFlags(CubicVR.enums.physics.collision_flags.NO_CONTACT_RESPONSE);            
          var groundRay = physics.getRayHit(sceneObject.position,CubicVR.vec3.subtract(sceneObject.position,[0,1,0]),true);
          rigidBody.setCollisionFlags(0);            

          if (groundRay) {
              var groundDist = vec3.length(vec3.subtract(sceneObject.position,groundRay.position));
              if (groundRay && groundDist <= 0.2) {
                  that.canJump = true;               
              } else {
                  that.canJump = false;
              }
          }
          
        }
      });
      sceneObject.scale = [ 0.05, 0.05, 0.05 ];
      scene.bindSceneObject( sceneObject );
    }; //prepare

    this.update = function() {
    }; //update

    if ( options.physics && options.scene && options.mvc ) {
      that.prepare( options.scene, options.physics, options.mvc );
    }
  }; //Player

  var Platform = function( options ) {
    options = options || {};
    Object.defineProperty( this, "mesh", { get: function() { return mesh; } } );
  }; //Platform

  var Audio = function( options ) {
    var bufferSize = 1024;

    var music = document.getElementById( 'game-audio' ),
        bd = new BeatDetektor( 140, 160 ),
        vu = new BeatDetektor.modules.vis.VU(),
        kickDet = new BeatDetektor.modules.vis.BassKick(),
        fft = new FFT( bufferSize, 44100 ),
        signal = new Float32Array( bufferSize/2 ),
        start;

    music.addEventListener( 'loadedmetadata', function( e ) {
      music.mozFrameBufferLength = bufferSize;
      music.addEventListener( 'MozAudioAvailable', function( e ) {
        var time = Date.now()/1000 - start;
        signal = DSP.getChannel( DSP.MIX, e.frameBuffer );
        fft.forward( signal );
        bd.process( time, signal );
        vu.process( bd );
        kickDet.process( bd );
      }, false );
    }, false );

    this.fft = fft;
    this.signal = signal;
    this.audio;

    music.addEventListener( 'canplay', function( e ) {
      music.play();
      start = Date.now()/1000;
    }, false );
    music.load();
    this.getVizCanvas = function( name ) {
      return vizCanvases[ name ];
    };
  }; //Audio

  var Viz = function( audio ) {
    var texturesByName = {},
        textures = [],
        signal = audio.signal
        fft = audio.fft;

    this.generateVizTexture = function( name, updateFunction ) {
      var update = function( canvas, ctx ) {
        updateFunction( canvas, ctx, audio, fft, signal );
      }
      var tex = new CubicVR.CanvasTexture( { width: 128, height: 128, update: update } );
      texturesByName[ name ] = tex;
      textures.push( tex );
    };
    this.getVizTexture = function( name ) {
      return texturesByName[ name ];
    };
    this.update = function() {
      for ( var i=0, l=textures.length; i<l; ++i ) {
        textures[ i ].update();
      }
    };
  }; //Viz


  document.addEventListener( "DOMContentLoaded", function( e ) {
    var gl = CubicVR.init();
    var canvas = CubicVR.getCanvas();
    if (!gl) {
      alert("Sorry, no WebGL support.");
      return;
    } //if

    var scene = new CubicVR.Scene(canvas.width, canvas.height, 80),
        physics = new CubicVR.ScenePhysics(),
        mvc = new CubicVR.MouseViewController(canvas, scene.camera),
        audio = new Audio(),
        viz = new Viz( audio );

    function createPlatformMesh() {
      var material = new CubicVR.Material({
            textures: {
              //color: viz.getVizTexture( 'viz1' )
              color: new CubicVR.Texture('assets/images/concrete3.jpg')
            }
          }),
          mesh = new CubicVR.Mesh(),
          surfaceMesh = CubicVR.primitives.plane({
            material: new CubicVR.Material({
              textures: {
                //color: viz.getVizTexture( 'viz2' )
                color: new CubicVR.Texture('assets/images/metal6.jpg')
              }
            }),
            uvmapper: {
              projectionAxis: CubicVR.enums.uv.axis.Z,
              projectionMode: CubicVR.enums.uv.projection.CUBIC,
              scale: [1, 1, 1]
            }
          });

      var mat4 = CubicVR.mat4;
      var half_box = 1 / 2.0;
      var pofs = mesh.points.length;
      
      mesh.setFaceMaterial( material );
      mesh.addPoint([
        [half_box, -half_box, half_box],
        [half_box, half_box, half_box],
        [-half_box, half_box, half_box],
        [-half_box, -half_box, half_box],
        [half_box, -half_box, -half_box],
        [half_box, half_box, -half_box],
        [-half_box, half_box, -half_box],
        [-half_box, -half_box, -half_box]
      ]);
      mesh.addFace([
        [pofs + 0, pofs + 1, pofs + 2, pofs + 3],
        [pofs + 7, pofs + 6, pofs + 5, pofs + 4],
        [pofs + 4, pofs + 5, pofs + 1, pofs + 0],
        [pofs + 6, pofs + 7, pofs + 3, pofs + 2]
      ]);
      
      var uvmapper = new CubicVR.UVMapper({
        projectionAxis: CubicVR.enums.uv.axis.Z,
        projectionMode: CubicVR.enums.uv.projection.CUBIC,
        scale: [1, 1, 1]
      });
      mesh.calcNormals();
      uvmapper.apply(mesh, material);  

      var surfaceTransform = new CubicVR.Transform();
      surfaceTransform.clearStack();
      surfaceTransform.translate( [ 0, 0, -.5 ] );
      surfaceTransform.rotate( [ 90, 0, 0 ] );
      mesh.booleanAdd( surfaceMesh, surfaceTransform );

      return mesh;
    } //createPlatformMesh

    scene.bindLight( new CubicVR.Light({
      type: CubicVR.enums.light.type.AREA,
      intensity: 0.9,
      mapRes: 512,  // 4096 ? 8192 ? ;)
      areaCeiling: 40,
      areaFloor: -40,
      areaAxis: [ -2, -2 ], // specified in degrees east/west north/south
      distance: 5
    }));

/*
    viz.generateVizTexture( "viz1", function( canvas, ctx, audio, fft, signal ) {
      var cw = canvas.width, ch = canvas.height;
          hw = cw/2, hh = ch/2;
      ctx.fillStyle = "#000000";
      ctx.fillRect( 0, 0, cw, ch );
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      for ( var i=0, l=fft.spectrum.length/4; i<l; ++i ) {
        var mag = fft.spectrum[ i ];
        ctx.rect( hw + i, hh, 1, -mag*100 );
        ctx.rect( hw - i, hh, 1, -mag*100 );
        ctx.rect( hw + i, hh, 1, mag*100 );
        ctx.rect( hw - i, hh, 1, mag*100 );
      } //for
      ctx.fill();
    });

    viz.generateVizTexture( "viz2", (function() {
      var max = 0;
      return function( canvas, ctx, audio, fft, signal ) {
        var cw = canvas.width, ch = canvas.height;
            hw = cw/2, hh = ch/2,
            c = Math.round( fft.spectrum[ 5 ] * 255 );
        if ( c > max && c > 25 ) {
          max = c;
        }
        ctx.fillStyle = "rgb("+max+", "+max+", "+max+")";
        ctx.fillRect( 0, 0, cw, ch );
        max -= max*.2;
        max = Math.round( max );
      }
    })());
*/  

    CubicVR.setSoftShadows(true);

    scene.setSkyBox( new CubicVR.SkyBox( { texture: "assets/images/space_skybox.jpg" } ) );

    var light = new CubicVR.Light( "#light-simple-point" );
    scene.bindLight(light);

    var levelData = JSON.parse( document.getElementById( 'level1-data' ).text ),
        levelMesh = new CubicVR.Mesh(),
        levelCollision = new CubicVR.CollisionMap(),
        transform = new CubicVR.Transform(),
        platformMesh = createPlatformMesh();

    for ( var i=0; i<5; ++i ) {
      for ( var o=0; o<50; ++o ) {
        if ( levelData[ i*50 + o ] ) { 
          var tpos = [ i, 0, -o ];
          transform.clearStack();
          transform.translate( tpos );
          levelMesh.booleanAdd( platformMesh, transform );
          levelCollision.addShape({ 
            type: CubicVR.enums.collision.shape.BOX,
            size: [1, 1, 1],
            position: tpos
          });  // construct compound shape
        } //if
      } //for o
    } //for i

    levelMesh.triangulateQuads().calcNormals().compile();

    var levelObject = new CubicVR.SceneObject( levelMesh );
    levelObject.position[ 1 ] = -1;
    
    var rigidBody = new CubicVR.RigidBody( levelObject, {
      type: CubicVR.enums.physics.body.GHOST,
      blocker: true,
      collision: levelCollision,
      restitution: 0.0
    });
    physics.bindRigidBody( rigidBody );
    scene.bindSceneObject( levelObject );

    var player = new Player({
      position: [ 0, 0, 0 ],
      scene: scene,
      physics: physics,
      mvc: mvc
    });
    mvc.setEvents({
      keyDown: function( ctx, mpos, keyCode, keyState ) {
        if ( keyCode === kbd.SPACE ) {
          player.jump();
        } //if
      } //keyDown
    }); //setEvents

    scene.camera.position = [ 0, .75, 1 ];
    scene.camera.target = [ 0, 0, 0 ];
    physics.setGravity( [ 0, -1, 0 ] );

    CubicVR.addResizeable(scene);

    var falling = false;

    CubicVR.MainLoop(function(timer, gl) {
      var lastSeconds = timer.getLastUpdateSeconds(),
          seconds = timer.getSeconds();

      //viz.update();

      physics.stepSimulation( lastSeconds );
      physics.triggerEvents();
      scene.runEvents( seconds );
      var playerPos = player.sceneObject.position;
      scene.camera.position = [
        playerPos[ 0 ],
        .5,
        playerPos[ 2 ] + 1
      ];

      if ( playerPos[ 1 ] < -3 ) {
        player.rigidBody.setPosition( [ 0, 0, 0 ] ); 
        player.rigidBody.setLinearVelocity( [ 0, 0, 0] );
        player.rigidBody.setAngularFactor(0);
        player.rigidBody.setAngularVelocity( [0,0,0] );
        player.rigidBody.setRotationEuler( [0,0,0] );
        falling = false;
      } else if ( playerPos[ 1 ] < -0.7 && !falling) {
        player.rigidBody.setAngularFactor(1);
        player.rigidBody.setAngularVelocity( [2.0*(Math.random()-0.5),2.0*(Math.random()-0.5),2.0*(Math.random()-0.5)] );
        falling = true;
      }

      player.update();
      light.position = player.sceneObject.position;
      scene.camera.target = [
        playerPos[ 0 ],
        0,
        playerPos[ 2 ]
      ];
      scene.updateShadows();
      scene.render();
    });
  }, false );
})();

