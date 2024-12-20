import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function Subway() {
  const [points, setPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [startGame, setStartGame] = useState(false);
  const [bestScore, setBestScore] = useState(0);

  const pointsRef = useRef(0);
  const requestRef = useRef();
  const rendererRef = useRef();
  const worldRef = useRef();
  const cameraRef = useRef();
  const sceneRef = useRef();
  const playerBodyRef = useRef();
  const playerRef = useRef();
  const pointBodiesRef = useRef([]);
  const pointMeshesRef = useRef([]);
  const enemyBodiesRef = useRef([]);
  const enemyMeshesRef = useRef([]);
  const clockRef = useRef(new THREE.Clock());

  const startSoundRef = useRef();
  const coinSoundRef = useRef();

  const gltfLoaderRef = useRef(new GLTFLoader());

  useEffect(() => {
    const storedBestScore = localStorage.getItem('bestScore');
    if (storedBestScore) {
      setBestScore(parseInt(storedBestScore));
    } else {
      localStorage.setItem('bestScore', 0);
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/skybox/panorama.jpg', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = texture;
    });

    scene.fog = new THREE.Fog(0xffffff, 1, 150);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    worldRef.current = world;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x222222);
    document.body.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.5, 5);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const player = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    player.position.y = -1;
    scene.add(player);
    playerRef.current = player;

    const playerBody = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)),
      fixedRotation: true,
      position: new CANNON.Vec3(0, 1, 0),
      material: new CANNON.Material({ friction: 0.0, restitution: 0 })
    });
    world.addBody(playerBody);
    playerBodyRef.current = playerBody;
    playerBody.linearDamping = 0.1;

    const groundShape = new CANNON.Box(new CANNON.Vec3(2, 0.1, 2000));
    const groundBody = new CANNON.Body({ mass: 0, shape: groundShape });
    groundBody.position.set(0, 0, -1000);
    world.addBody(groundBody);

    const groundMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4000),
      new THREE.MeshStandardMaterial({
        color: 0xbee6fe,
        roughness: 0.1,
        metalness: 0.7,
      })
    );
    groundMesh.position.set(0, 0, -1000);
    scene.add(groundMesh);

    function spawnPoint() {
      const lanes = [-1, 0, 1];
      const randomLane = lanes[Math.floor(Math.random() * lanes.length)];
      const spawnZ = playerBody.position.z - 30;

      const pointShape = new CANNON.Sphere(0.2);
      const pointBody = new CANNON.Body({ mass: 0, shape: pointShape });
      pointBody.position.set(randomLane, 0.6, spawnZ);
      world.addBody(pointBody);
      pointBodiesRef.current.push(pointBody);

      gltfLoaderRef.current.load(
        '/models/coin/coin.glb',
        (gltf) => {
          const pointMesh = gltf.scene;
          pointMesh.scale.set(0.05, 0.05, 0.05);
          pointMesh.position.copy(pointBody.position);
          pointMesh.position.x -= 0.4;
          pointMesh.position.y -= 0.2;
          scene.add(pointMesh);
          pointMeshesRef.current.push(pointMesh);
        },
        undefined,
        (error) => {
          console.error('Error loading coin model:', error);
        }
      );
    }

    function createFenceMesh() {
      const fenceGroup = new THREE.Group();
      const barMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, metalness:0.2, roughness:0.7 });

      const barHeight = 1.5;
      const barCount = 5;
      const barSpacing = 0.25;
      const barGeometry = new THREE.BoxGeometry(0.05, barHeight, 0.1);

      for (let i = 0; i < barCount; i++) {
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        const startX = -(barCount - 1) * barSpacing * 0.5;
        bar.position.set(startX + i * barSpacing, 0.6, 0);
        fenceGroup.add(bar);
      }

      const topBarGeometry = new THREE.BoxGeometry((barCount-1)*barSpacing + 0.2, 0.05, 0.1);
      const topBar = new THREE.Mesh(topBarGeometry, barMaterial);
      topBar.position.set(0, 0.6 + barHeight*0.5, 0);
      fenceGroup.add(topBar);

      const bottomBar = new THREE.Mesh(topBarGeometry, barMaterial);
      bottomBar.position.set(0, 0.6 - barHeight*0.5, 0);
      fenceGroup.add(bottomBar);

      return fenceGroup;
    }

    function spawnEnemy() {
      const lanes = [-1, 0, 1];
      const randomLane = lanes[Math.floor(Math.random() * lanes.length)];
      const spawnZ = playerBody.position.z - 30;

      const enemyShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.75, 0.05));
      const enemyBody = new CANNON.Body({ mass: 0, shape: enemyShape });
      enemyBody.position.set(randomLane, 0.6, spawnZ);
      world.addBody(enemyBody);
      enemyBodiesRef.current.push(enemyBody);

      const enemyMesh = createFenceMesh();
      enemyMesh.position.copy(enemyBody.position);
      scene.add(enemyMesh);
      enemyMeshesRef.current.push(enemyMesh);
    }

    let pointSpawnTimer = 0;
    let enemySpawnTimer = 0;
    let currentLane = 0;

    const resetGame = () => {
      playerBody.position.set(0, 1, 0);
      playerBody.velocity.set(0, 0, 0);
      setPoints(0);
      setGameOver(false);
      setStartGame(false);

      pointBodiesRef.current.forEach((pb) => world.removeBody(pb));
      pointMeshesRef.current.forEach((pm) => scene.remove(pm));
      pointBodiesRef.current = [];
      pointMeshesRef.current = [];

      enemyBodiesRef.current.forEach((eb) => world.removeBody(eb));
      enemyMeshesRef.current.forEach((em) => scene.remove(em));
      enemyBodiesRef.current = [];
      enemyMeshesRef.current = [];
    };

    function handleKeyDown(e) {
      if (e.key.toLowerCase() === "r") {
        resetGame();
        return;
      }

      if (!startGame && e.key === "Enter") {
        setStartGame(true);
        if (startSoundRef.current) {
          startSoundRef.current.play();
        }
      }

      if (gameOver) return;

      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "q") {
        currentLane = Math.max(currentLane - 1, -1);
        playerBody.position.x = currentLane;
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
        currentLane = Math.min(currentLane + 1, 1);
        playerBody.position.x = currentLane;
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function checkGameOver() {
      if (
        playerBody.position.y < -2 ||
        playerBody.position.x < -1.5 ||
        playerBody.position.x > 1.5
      ) {
        setGameOver(true);
        setStartGame(false);
        if (pointsRef.current > bestScore) {
          setBestScore(pointsRef.current);
          localStorage.setItem('bestScore', pointsRef.current);
        }
      }

      enemyBodiesRef.current.forEach((enemyBody) => {
        const dist = playerBody.position.vsub(enemyBody.position).length();
        if (dist < 0.5) {
          setGameOver(true);
          setStartGame(false);
          if (pointsRef.current > bestScore) {
            setBestScore(pointsRef.current);
            localStorage.setItem('bestScore', pointsRef.current);
          }
        }
      });
    }

    function animate() {
      requestRef.current = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();

      if (startGame && !gameOver) {
        const baseSpeed = 10;
        const speedIncreasePerPoint = 0.2;
        const speed = baseSpeed + pointsRef.current * speedIncreasePerPoint;

        playerBody.position.z -= speed * delta;

        const minSpawnInterval = 0.2;
        const maxSpawnInterval = 0.5;
        const spawnInterval = maxSpawnInterval - (pointsRef.current * 0.01);
        const spawnIntervalAdjusted = Math.max(minSpawnInterval, spawnInterval);

        pointSpawnTimer += delta;
        if (pointSpawnTimer > spawnIntervalAdjusted) {
          spawnPoint();
          pointSpawnTimer = 0;
        }

        const enemySpawnIntervalAdjusted = spawnIntervalAdjusted * 1.5;
        enemySpawnTimer += delta;
        if (enemySpawnTimer > enemySpawnIntervalAdjusted) {
          spawnEnemy();
          enemySpawnTimer = 0;
        }

        world.fixedStep();

        player.position.copy(playerBody.position);
        player.quaternion.copy(playerBody.quaternion);

        camera.position.x = player.position.x;
        camera.position.y = player.position.y + 1.5;
        camera.position.z = player.position.z + 5;
        camera.lookAt(player.position.x, player.position.y, player.position.z);

        for (let i = 0; i < pointBodiesRef.current.length; i++) {
          const pBody = pointBodiesRef.current[i];
          const pMesh = pointMeshesRef.current[i];
          const dist = playerBody.position.vsub(pBody.position).length();
          if (dist < 0.5) {
            if (coinSoundRef.current) {
              coinSoundRef.current.currentTime = 0; 
              coinSoundRef.current.play();
            }
            setPoints((prev) => {
              const newPoints = prev + 1;
              pointsRef.current = newPoints;
              return newPoints;
            });
            world.removeBody(pBody);
            scene.remove(pMesh);
            pointBodiesRef.current.splice(i, 1);
            pointMeshesRef.current.splice(i, 1);
            i--;
          }
        }

        checkGameOver();
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(requestRef.current);
      document.body.removeChild(renderer.domElement);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [gameOver, startGame, bestScore]);

  useEffect(() => {
    const startSound = new Audio('/sounds/theme.mp3');
    const coinSound = new Audio('/sounds/coin.mp3');
    startSoundRef.current = startSound;
    coinSoundRef.current = coinSound;
  }, []);

  return (
    <div className="absolute m-0 text-white top-3 left-3">
      {gameOver && <h1>Game Over! Press R to reset</h1>}
      {!startGame && !gameOver && <h1>Press Enter to Start</h1>}
      <h1>Points: {points}</h1>
      <h1>Best Score: {bestScore}</h1>
    </div>
  );
}

export default Subway;