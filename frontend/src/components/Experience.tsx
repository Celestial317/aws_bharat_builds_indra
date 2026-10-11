import { useRef, useState } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  ContactShadows,
  Float,
} from "@react-three/drei";
import * as THREE from "three";
import { rwhComponents, RWHComponent } from "../data/rwhData";

interface InteractivePartProps {
  componentId: string;
  onSelect: (component: RWHComponent | null) => void;
  children: React.ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

const InteractivePart = ({
  componentId,
  onSelect,
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: InteractivePartProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "auto";
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const component = rwhComponents[componentId];
    if (component) {
      onSelect(component);
    }
  };

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {children}
      {hovered && (
        <pointLight
          position={[0, 0, 0]}
          intensity={2}
          distance={3}
          color={rwhComponents[componentId]?.emissiveColor || "#ffffff"}
        />
      )}
    </group>
  );
};

interface HouseProps {
  onSelect: (component: RWHComponent | null) => void;
}

const House = ({ onSelect }: HouseProps) => {
  const houseRef = useRef<THREE.Group>(null);

  // Materials
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: "#f0f0f0",
    roughness: 0.8,
    metalness: 0.1,
  });

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: "#3d4555",
    roughness: 0.6,
    metalness: 0.2,
  });

  return (
    <group ref={houseRef}>
      {/* House Body */}
      <mesh position={[0, 1, 0]} castShadow receiveShadow material={concreteMaterial}>
        <boxGeometry args={[4, 2, 3]} />
      </mesh>

      {/* Roof - Catchment Area */}
      <InteractivePart componentId="catchment" onSelect={onSelect}>
        <mesh position={[0, 2.5, 0]} castShadow material={roofMaterial}>
          <boxGeometry args={[4.4, 0.3, 3.4]} />
        </mesh>
        {/* Roof pitch */}
        <mesh position={[0, 2.9, 0]} castShadow>
          <cylinderGeometry args={[0.1, 2.2, 0.6, 4]} />
          <meshStandardMaterial color="#3d4555" roughness={0.6} metalness={0.2} />
        </mesh>
      </InteractivePart>

      {/* Windows */}
      <mesh position={[-1, 1.2, 1.51]} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.05]} />
        <meshStandardMaterial color="#87ceeb" roughness={0.1} metalness={0.8} />
      </mesh>
      <mesh position={[1, 1.2, 1.51]} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.05]} />
        <meshStandardMaterial color="#87ceeb" roughness={0.1} metalness={0.8} />
      </mesh>

      {/* Door */}
      <mesh position={[0, 0.6, 1.51]} castShadow>
        <boxGeometry args={[0.7, 1.2, 0.05]} />
        <meshStandardMaterial color="#8b4513" roughness={0.8} />
      </mesh>

      {/* Gutters - Left side */}
      <InteractivePart
        componentId="gutters"
        onSelect={onSelect}
        position={[-2.1, 2.2, 0]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.1, 3.2]} />
          <meshStandardMaterial
            color="#2d9e9e"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
      </InteractivePart>

      {/* Gutters - Right side */}
      <InteractivePart
        componentId="gutters"
        onSelect={onSelect}
        position={[2.1, 2.2, 0]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.1, 3.2]} />
          <meshStandardMaterial
            color="#2d9e9e"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
      </InteractivePart>

      {/* Gutters - Front */}
      <InteractivePart
        componentId="gutters"
        onSelect={onSelect}
        position={[0, 2.2, 1.6]}
      >
        <mesh castShadow>
          <boxGeometry args={[4.4, 0.1, 0.15]} />
          <meshStandardMaterial
            color="#2d9e9e"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
      </InteractivePart>

      {/* Downspout */}
      <InteractivePart
        componentId="downspout"
        onSelect={onSelect}
        position={[2.15, 1.1, 1.5]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
          <meshStandardMaterial
            color="#2d9e9e"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
      </InteractivePart>

      {/* Leaf Filter */}
      <InteractivePart
        componentId="leafFilter"
        onSelect={onSelect}
        position={[2.15, 0, 1.5]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.25, 0.15, 0.25]} />
          <meshStandardMaterial
            color="#4a9b6d"
            roughness={0.4}
            metalness={0.5}
          />
        </mesh>
        {/* Mesh pattern */}
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.22, 0.02, 0.22]} />
          <meshStandardMaterial
            color="#3a8b5d"
            roughness={0.3}
            metalness={0.6}
            wireframe
          />
        </mesh>
      </InteractivePart>

      {/* First Flush Diverter */}
      <InteractivePart
        componentId="firstFlush"
        onSelect={onSelect}
        position={[2.5, -0.3, 1.5]}
      >
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 8]} />
          <meshStandardMaterial
            color="#e6a23c"
            roughness={0.3}
            metalness={0.5}
          />
        </mesh>
        {/* Vertical collection chamber */}
        <mesh position={[0.35, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.6, 8]} />
          <meshStandardMaterial
            color="#e6a23c"
            roughness={0.3}
            metalness={0.5}
          />
        </mesh>
        {/* Cap */}
        <mesh position={[0.35, -0.55, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.05, 8]} />
          <meshStandardMaterial
            color="#cc8a2a"
            roughness={0.4}
            metalness={0.6}
          />
        </mesh>
      </InteractivePart>

      {/* Connection pipe to tank */}
      <mesh position={[3.2, -0.3, 1.2]} castShadow rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.2, 8]} />
        <meshStandardMaterial color="#2d9e9e" roughness={0.3} metalness={0.7} />
      </mesh>

      {/* Storage Tank */}
      <InteractivePart
        componentId="tank"
        onSelect={onSelect}
        position={[3.8, 0.3, 0]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.8, 0.8, 2, 16]} />
          <meshStandardMaterial
            color="#4a7ab0"
            roughness={0.4}
            metalness={0.6}
          />
        </mesh>
        {/* Tank top */}
        <mesh position={[0, 1.05, 0]} castShadow>
          <cylinderGeometry args={[0.85, 0.85, 0.1, 16]} />
          <meshStandardMaterial
            color="#3a6a9a"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        {/* Tank inlet */}
        <mesh position={[-0.7, 0.7, 0]} castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} />
          <meshStandardMaterial
            color="#2d9e9e"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        {/* Tank outlet */}
        <mesh position={[0, -0.8, 0.7]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.3, 8]} />
          <meshStandardMaterial
            color="#2d9e9e"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        {/* Water level indicator */}
        <mesh position={[0.82, 0, 0]} castShadow>
          <boxGeometry args={[0.05, 1.5, 0.1]} />
          <meshStandardMaterial
            color="#87ceeb"
            roughness={0.1}
            metalness={0.3}
            transparent
            opacity={0.8}
          />
        </mesh>
      </InteractivePart>

      {/* Ground base */}
      <mesh position={[1.5, -0.7, 0.5]} receiveShadow>
        <boxGeometry args={[8, 0.1, 6]} />
        <meshStandardMaterial color="#8fbc8f" roughness={0.9} />
      </mesh>
    </group>
  );
};

interface AnimatedRainDropProps {
  position: [number, number, number];
  delay: number;
}

const AnimatedRainDrop = ({ position, delay }: AnimatedRainDropProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [yPos, setYPos] = useState(position[1] + delay * 2);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      setYPos((prev) => {
        const newY = prev - delta * 3;
        if (newY < 2.5) return position[1] + 5;
        return newY;
      });
      meshRef.current.position.y = yPos;
    }
  });

  return (
    <mesh ref={meshRef} position={[position[0], yPos, position[2]]}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshStandardMaterial
        color="#87ceeb"
        transparent
        opacity={0.6}
        roughness={0.1}
        metalness={0.3}
      />
    </mesh>
  );
};

const RainDrops = () => {
  const drops = Array.from({ length: 20 }, () => ({
    position: [
      (Math.random() - 0.5) * 5,
      5 + Math.random() * 3,
      (Math.random() - 0.5) * 4,
    ] as [number, number, number],
    delay: Math.random() * 3,
  }));

  return (
    <group>
      {drops.map((drop, index) => (
        <AnimatedRainDrop key={index} position={drop.position} delay={drop.delay} />
      ))}
    </group>
  );
};

interface ExperienceProps {
  onSelect: (component: RWHComponent | null) => void;
}

const Experience = ({ onSelect }: ExperienceProps) => {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 5, 8], fov: 45 }}
      style={{ background: "linear-gradient(180deg, #e8f4f8 0%, #d0e8f0 100%)" }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      <Float speed={1} rotationIntensity={0} floatIntensity={0.3}>
        <House onSelect={onSelect} />
      </Float>

      <RainDrops />

      <ContactShadows
        position={[1.5, -0.74, 0.5]}
        opacity={0.4}
        scale={12}
        blur={2}
        far={4}
      />

      <Environment preset="city" />

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={5}
        maxDistance={15}
        target={[1.5, 0.5, 0]}
      />
    </Canvas>
  );
};

export default Experience;
