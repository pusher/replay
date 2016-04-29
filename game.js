const ROUND_LENGTH = 11;
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

var grid;
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
var clock;
var clock_hand;
var target_hand;
var ghosts = [];
var world_state = WorldState.RUNNING;
var prevEventReceivedAt = 0;
var out_of_time;
var win_text;

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
    game.load.image('background', 'assets/background_very_final.jpg');
    game.load.image('1', 'assets/characters/1.png');
    game.load.image('2', 'assets/characters/2.png');
    game.load.image('3', 'assets/characters/3.png');
    game.load.image('4', 'assets/characters/4.png');
    game.load.image('5', 'assets/characters/5.png');
    game.load.image('6', 'assets/characters/6.png');
    game.load.image('7', 'assets/characters/7.png');
    game.load.image('8', 'assets/characters/8.png');
    game.load.image('9', 'assets/characters/9.png');
    game.load.bitmapFont('carrier_command', 'assets/fonts/carrier_command.png', 'assets/fonts/carrier_command.xml');
    game.load.physics('physicsData', 'assets/physics.json');
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

    character = getUrlVars()['character'] || character;

    game.physics.startSystem(Phaser.Physics.ARCADE);
    game.physics.startSystem(Phaser.Physics.P2JS);

    grid = game.add.sprite(game.width/2, game.height/2, 'background');
    grid.anchor.setTo(0.5, 0.5);

    ufo = game.add.sprite(10, 300, character);
    ufo.anchor.setTo(0.5, 0.5);
    ufo.collideWorldBounds = true;
    ufo.scale.setTo(CHAR_SCALE, CHAR_SCALE);

    game.physics.p2.enable([grid, ufo]);

    grid.body.clearShapes();
    grid.body.loadPolygon('physicsData', 'background');
    grid.body.kinematic = true;

    target = game.add.sprite(900, 300, 'target');
    target_hand = game.add.sprite(900, 300, 'target_hand');
    target.alpha = 0
    target_hand.alpha = 0
    target.anchor.setTo(0.5, 0.5);
    target_hand.anchor.setTo(0.5, 0.5);
    game.physics.enable(target, Phaser.Physics.ARCADE);
    target.body.immovable = true;

    clock = game.add.sprite(800, 530, 'target');
    clock_hand = game.add.sprite(800, 530, 'target_hand');
    clock.anchor.setTo(0.5, 0.5);
    clock_hand.anchor.setTo(0.5, 0.5);

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
    win_text = game.add.bitmapText(450, 350, 'carrier_command', 'GOOD JOB!', 34);
    win_text.anchor.setTo(0.5, 0.5);
    game.time.events.add(Phaser.Timer.SECOND * 3, function() {win_text.destroy();}, this);
}

function spawn(){
    trigger('client-spawn');

    var x = game.rnd.realInRange(10, 50);
    var y = game.rnd.realInRange(50, 550);

    ufo.loadTexture(character);
    ufo.alpha = 1;
    ufo.body.x = x;
    ufo.body.y = y;
    ufo_state = UfoState.ALIVE;
}

function update_running(){
    if(time_to_end_of_round() == 0){
        world_state = WorldState.RECOVERY;
        explode();
        out_of_time = game.add.bitmapText(450, 300, 'carrier_command', 'OUT OF TIME!', 34);
        out_of_time.anchor.setTo(0.5, 0.5);
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
        out_of_time.destroy();
        return;
    }
}

function update() {
    clock_hand.angle = 360 - 360 * (time_to_end_of_round() / ROUND_LENGTH);
    if(world_state == WorldState.RUNNING) {
        update_running();
    } else {
        update_recovery();
    }
}

function moveUfo() {
    if (game.input.keyboard.isDown(Phaser.Keyboard.LEFT))
    {
        ufo.body.velocity.x -= speed;
    }
    else if (game.input.keyboard.isDown(Phaser.Keyboard.RIGHT))
    {
        ufo.body.velocity.x += speed;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.UP))
    {
        ufo.body.velocity.y -= speed;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.DOWN))
    {
        ufo.body.velocity.y += speed;
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
