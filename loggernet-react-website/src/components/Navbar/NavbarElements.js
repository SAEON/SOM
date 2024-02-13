import { FaBars } from "react-icons/fa";
import { NavLink as Link } from "react-router-dom";
import styled from "styled-components";

export const Nav = styled.nav`
  background: #2a5915;
  display: flex;
  flex-direction: column;  // Stack children vertically
  align-items: center;  // Center children horizontally
  justify-content: center;  // Center children vertically
  padding: 0;  // Removed padding to align items to the top
  z-index: 12;
`;

export const NavHeader = styled.div`
  display: flex;
  width: 100%;
  align-items: center;  // Align items vertically
  justify-content: space-between;  // Allocate space between logo and title
  padding: 0 1rem;  // Padding on both sides of the header
  height: 85px;  // Fixed height of the NavHeader
`;

export const NavLogo = styled.div`
  height: 85px;  // Match the height of the NavHeader
  display: flex;
  align-items: center;
  justify-content: center;  // Center the logo inside the div
  img {
    height: 85px;  // Set the logo height to fill the NavLogo div
    width: auto;  // Maintain aspect ratio
    object-fit: contain;  // Ensure the logo is fully visible without being cropped
  }
`;

export const NavTitle = styled.h1`
  color: #808080;
  display: flex;  // Make the title a flex container to center the text
  align-items: center;  // Center the text vertically
  justify-content: center;  // Center the text horizontally
  flex-grow: 1;  // Allow the title to fill the space
  padding: 0;  // No padding
`;

export const NavLink = styled(Link)`
  color: #808080;
  display: flex;
  align-items: center;
  text-decoration: none;
  padding: 0 1rem;
  height: 100%;
  cursor: pointer;
  &.active {
    color: #ffc72c;
  }
`;

export const NavMenu = styled.div`
  display: flex;
  justify-content: center;  // Center the links horizontally
  align-items: center;  // Align the links vertically
  width: 100%;  // Take up the full width
  margin-top: 0;  // Removed the margin to reduce space between title and nav links
`;
