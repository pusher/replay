const ROUND_LENGTH = 20;
const RECOVERY_TIME = 3;
replay_toggle = false;
const CHAR_SCALE = 0.3;

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

var channel_name = getUrlVars()['channel'] || 'channel';
var pusher = new Pusher("<YOUR APP KEY>", {
  authTransport: 'client',
  clientAuth: {
        key: "<YOUR APP KEY>",
        secret: "<YOUR APP SECRET>"
      },
  cluster: 'eu'
});
var channel = pusher.subscribe('private-' + channel_name);
var character = '1';

var game = new Phaser.Game( 900,
                            600,
                            Phaser.CANVAS,
                            'phaser-example',
                            {   preload: preload,
                                create: create,
                                update: update,
                                render: render });

var ufo;
var target;
var target_hand;
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
    game.world.setBounds(0, 0, 1200, 600);
    game.load.image('alive', 'assets/sprites/ufo.png');
    game.load.image('dying', 'assets/sprites/yellow_ball.png');
    game.load.image('target', 'assets/clock/1.png');
    game.load.image('target_hand', 'assets/clock/2.png');
    game.load.image('background', 'assets/big_grid.jpg');
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

function trigger(type){
    channel.trigger(type, {
        "playerId": playerId,
        "x": ufo.x,
        "y": ufo.y,
        "character": character
    });
}

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi,
            function(m,key,value) {
                vars[key] = value;
            });
    return vars;
}

function create() {

    //character = location.search.split('character=')[1] || character;
    character = getUrlVars()['character'] || character;

    game.physics.startSystem(Phaser.Physics.ARCADE);

    game.add.tileSprite(0, 0, game.width, game.height, 'background');

    target = game.add.sprite(800, 300, 'target');
    target_hand = game.add.sprite(800, 300, 'target_hand');
    target.anchor.setTo(0.5, 0.5);
    target_hand.anchor.setTo(0.5, 0.5);
    game.physics.enable(target, Phaser.Physics.ARCADE);
    target.body.immovable = true;

    ufo = game.add.sprite(850, 850, character);
    ufo.anchor.setTo(0.5, 0.5);
    ufo.collideWorldBounds = true;
    ufo.scale.setTo(CHAR_SCALE, CHAR_SCALE);

    game.physics.enable(ufo, Phaser.Physics.ARCADE);
    game.stage.disableVisibilityChange = true;

    spawn();

    setInterval(function() {
      if(is_alive()){
          trigger('client-move');
      }
    }, 200); // Update this to change the delay between triggers in ms

    channel.bind('client-move', function(pos) {
        var player_id = pos['playerId'];
        check_ufo_exists(pos);
        var now = game.time.now;
        var tween = game.add.tween(other_ufos[player_id]);
        tween.to({'x': pos['x'], 'y': pos['y']}, now - prevEventReceivedAt);
        tween.start();

        prevEventReceivedAt = now
    });

    channel.bind('client-explode', function(pos){
        check_ufo_exists(pos);
        var player_id = pos['playerId'];
        other_ufos[player_id].destroy();
        delete other_ufos[player_id];
    });


    channel.bind('client-win', function(pos){
        check_ufo_exists(pos);
        var player_id = pos['playerId'];
        other_ufos[player_id].destroy();
        delete other_ufos[player_id];
    });
}

function check_ufo_exists(obj){
    var player_id = obj['playerId'];
    if (other_ufos[player_id] == undefined) {
        var thing = game.add.sprite(obj['x'], obj['y'], obj['character']);
        thing.scale.setTo(CHAR_SCALE, CHAR_SCALE);
        game.physics.enable(thing, Phaser.Physics.ARCADE);
        thing.anchor.setTo(0.5, 0.5);
        other_ufos[player_id] = thing;
    }
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
    trigger('client-explode');
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
    trigger('client-win');
    ufo_state = UfoState.WINNING;
    var tween = game.add.tween(ufo).to( {alpha: 0}, 500, "Linear", true);
}

function spawn(){
    trigger('client-spawn');

    var x = game.rnd.realInRange(10, 50);
    var y = game.rnd.realInRange(200, 400);

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
    target_hand.angle = 360 - 360 * (time_to_end_of_round() / ROUND_LENGTH);
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
        game.physics.arcade.collide(ufo, other_ufos[other_ufo], function() { return ; });
    });
}

function render() {
    if(!replay_toggle) { return ;}
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
