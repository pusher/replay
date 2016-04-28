const ROUND_LENGTH = 17;
const RECOVERY_TIME = 3;

UfoState = {
    ALIVE: 0,
    DYING: 1,
    DEAD: 2,
    WINNING: 3
};

WorldState = {
    RECOVERY: 1,
    RUNNING: 2
};

var pusher = new Pusher("<YOUR APP KEY>", {
  authTransport: 'client',
  clientAuth: {
        key: "<YOUR APP KEY>",
        secret: "<YOUR APP SECRET>"
      },
  cluster: 'eu'
});
var channel = pusher.subscribe('private-channel');
var character = '1';

var game = new Phaser.Game( 800,
                            800,
                            Phaser.CANVAS,
                            'phaser-example',
                            {   preload: preload,
                                create: create,
                                update: update,
                                render: render });

var ufo;
var target;
var ghosts = [];
var world_state = WorldState.RUNNING;
var prevEventReceivedAt = 0;

function time_to_end_of_round() {
    var extra = Math.floor(world_time() % (ROUND_LENGTH + RECOVERY_TIME));
    return Math.max(0, ROUND_LENGTH - extra);
}

function time_to_start_of_round() {
    if (time_to_end_of_round() != 0) {return 0;}
    var extra = Math.floor(world_time() % (ROUND_LENGTH + RECOVERY_TIME));
    return Math.max(0, (ROUND_LENGTH + RECOVERY_TIME) - extra);
}

function world_time(){
    return Math.floor(Date.now() / 1000);
}

function world_round_start(){
    var extra = Math.floor(world_time() % (ROUND_LENGTH + RECOVERY_TIME));
    return Math.floor( world_time() - extra);
}

function world_round() {
    return Math.floor(world_time() / (ROUND_LENGTH + RECOVERY_TIME));
}

var playerId = Math.random().toString(36).substring(7);

var ufo_state = UfoState.DEAD;
var speed = 4;
var other_ufos = {};

function preload() {
    game.world.setBounds(0, 0, 800, 800);
    game.load.image('alive', 'assets/sprites/ufo.png');
    game.load.image('dying', 'assets/sprites/yellow_ball.png');
    game.load.image('target', 'assets/sprites/wizball.png');
    game.load.image('background', 'assets/landing.jpg');
    game.load.image('1', 'assets/characters/1.png');
    game.load.image('2', 'assets/characters/2.png');
    game.load.image('3', 'assets/characters/3.png');
    game.load.image('4', 'assets/characters/4.png');
    game.load.image('5', 'assets/characters/5.png');
    game.load.image('6', 'assets/characters/6.png');
    game.load.image('7', 'assets/characters/7.png');
    game.load.image('8', 'assets/characters/8.png');
    game.load.image('9', 'assets/characters/9.png');
}

function create() {

    character = location.search.split('character=')[1] || character;

    game.physics.startSystem(Phaser.Physics.ARCADE);

    game.add.tileSprite(0, 0, game.width, game.height, 'background');

    target = game.add.sprite(400, 400, 'target');
    target.anchor.setTo(0.5, 0.5);
    game.physics.enable(target, Phaser.Physics.ARCADE);
    target.body.immovable = true;

    ufo = game.add.sprite(850, 850, character);
    ufo.anchor.setTo(0.5, 0.5);

    game.physics.enable(ufo, Phaser.Physics.ARCADE);
    game.stage.disableVisibilityChange = true;

    spawn();

    setInterval(function() {
      channel.trigger('client-pos',
                      {"playerId": playerId,
                       "x": ufo.x,
                       "y": ufo.y,
                       "angle": ufo.angle,
                       "character": character});
    }, 200); // Update this to change the delay between triggers in ms

    channel.bind('client-pos', function(pos) {
      if (other_ufos[pos['playerId']] == undefined) {
        var thing = game.add.sprite(pos['x'], pos['y'], pos['character']);
        game.physics.enable(thing, Phaser.Physics.ARCADE);
        thing.anchor.setTo(0.5, 0.5);
        thing.body.immovable = true;
        other_ufos[pos['playerId']] = thing;
      } else {
        var now = game.time.now
        var tween = game.add.tween(other_ufos[pos['playerId']]);
        tween.to({'x': pos['x'], 'y': pos['y'], 'angle': pos['angle']}, now - prevEventReceivedAt);
        tween.start();

        prevEventReceivedAt = now
      }
    });
}

function checkOverlap(spriteA, spriteB, f) {

    var boundsA = spriteA.getBounds();
    var boundsB = spriteB.getBounds();

    if( Phaser.Rectangle.intersects(boundsA, boundsB))
    {
        f.call(spriteA, spriteB);
    }

}

function is_alive(){
    return ufo_state == UfoState.ALIVE;
}

function explode(){
    ufo_state = UfoState.DYING;
    ufo.loadTexture('dying');
    var tween = game.add.tween(ufo).to( {alpha: 0}, 500, "Linear", true);
}

function die(){
    ufo_state = UfoState.DEAD;
    var ghost_x = ufo.x;
    var ghost_y = ufo.y;
}

function win(){
    ufo_state = UfoState.WINNING;
    var tween = game.add.tween(ufo).to( {alpha: 0}, 500, "Linear", true);
}

function spawn(){
    var r = 200 + Math.random() * 200 ;
    var angle = Math.random() * (2 * Math.PI);


    var x = 400 + r * Math.cos(angle);
    var y = 400 + r * Math.sin(angle);

    ufo.loadTexture(character);
    ufo.alpha = 1;
    ufo.x = x;
    ufo.y = y;
    ufo_state = UfoState.ALIVE;
}

function update_running(){
    if(time_to_end_of_round() == 0){
        world_state = WorldState.RECOVERY;
        explode();
        return;
    }

    if(!is_alive()) { return ;}

    moveUfo();
    checkCollisions();
}

function update_recovery(){
    if(time_to_start_of_round() == 0){
        world_state = WorldState.RUNNING;
        spawn();
        return;
    }
}

function update() {

    if(world_state == WorldState.RUNNING) {
        update_running();
    } else {
        update_recovery();
    }
}

function moveUfo() {
    if (game.input.keyboard.isDown(Phaser.Keyboard.LEFT))
    {
        ufo.body.x -= speed;
    }
    else if (game.input.keyboard.isDown(Phaser.Keyboard.RIGHT))
    {
        ufo.body.x += speed;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.UP))
    {
        ufo.body.y -= speed;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.DOWN))
    {
        ufo.body.y += speed;
    }
}

function checkCollisions() {
    checkOverlap(ufo, target, win);
    Object.keys(other_ufos).map(function(other_ufo){
        checkOverlap(ufo, other_ufos[other_ufo], explode);
    });
}

function render() {
    game.debug.spriteInfo(ufo, 32, 32);
    game.debug.text(ufo_state, 100, 400);
    game.debug.text(world_time(), 100, 420);
    game.debug.text(world_round(), 100, 440);
    if (world_state == WorldState.RUNNING) {
        game.debug.text('RUNNING', 100, 460);
    }
    else {
        game.debug.text('RECOVERY', 100, 460);
    }
    game.debug.text(time_to_end_of_round(), 100, 480);
    game.debug.text(time_to_start_of_round(), 100, 500);
}
