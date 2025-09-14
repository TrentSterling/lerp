using UnityEngine;

/// <summary>
/// A static class containing framerate-independent smoothing (FRIM Lerp) extension methods
/// for float and Vector3 types. Based on the work of Rory Driscoll, Ashley, and Freya Holmér.
/// </summary>
public static class SmoothingExtensions
{
    #region Float Extensions

    /// <summary>
    /// Smooths a float towards a target using the half-life method.
    /// </summary>
    /// <param name="source">The starting value.</param>
    /// <param name="target">The target value.</param>
    /// <param name="halfLife">The time in seconds it should take to get halfway to the target. Smaller values are faster.</param>
    /// <param name="deltaTime">The time since the last frame (e.g., Time.deltaTime).</param>
    public static float LerpFrimHalfLife(this float source, float target, float halfLife, float deltaTime)
    {
        return Mathf.Lerp(source, target, 1f - Mathf.Pow(2f, -deltaTime / halfLife));
    }

    /// <summary>
    /// Smooths a float towards a target using a smoothing factor.
    /// </summary>
    /// <param name="source">The starting value.</param>
    /// <param name="target">The target value.</param>
    /// <param name="smoothing">A value from 0-1 representing the fraction of the distance remaining after one second.</param>
    /// <param name="deltaTime">The time since the last frame (e.g., Time.deltaTime).</param>
    public static float LerpFrim(this float source, float target, float smoothing, float deltaTime)
    {
        return Mathf.Lerp(source, target, 1f - Mathf.Pow(smoothing, deltaTime));
    }

    /// <summary>
    /// Smooths a float towards a target using a decay constant (lambda).
    /// </summary>
    /// <param name="source">The starting value.</param>
    /// <param name="target">The target value.</param>
    /// <param name="lambda">A decay constant. Higher values are faster.</param>
    /// <param name="deltaTime">The time since the last frame (e.g., Time.deltaTime).</param>
    public static float LerpFrimLambda(this float source, float target, float lambda, float deltaTime)
    {
        return Mathf.Lerp(source, target, 1f - Mathf.Exp(-lambda * deltaTime));
    }

    #endregion

    #region Vector3 Extensions

    /// <summary>
    /// Smooths a Vector3 towards a target using the half-life method.
    /// </summary>
    /// <param name="source">The starting value.</param>
    /// <param name="target">The target value.</param>
    /// <param name="halfLife">The time in seconds it should take to get halfway to the target. Smaller values are faster.</param>
    /// <param name="deltaTime">The time since the last frame (e.g., Time.deltaTime).</param>
    public static Vector3 LerpFrimHalfLife(this Vector3 source, Vector3 target, float halfLife, float deltaTime)
    {
        return Vector3.Lerp(source, target, 1f - Mathf.Pow(2f, -deltaTime / halfLife));
    }

    /// <summary>
    /// Smooths a Vector3 towards a target using a smoothing factor.
    /// </summary>
    /// <param name="source">The starting value.</param>
    /// <param name="target">The target value.</param>
    /// <param name="smoothing">A value from 0-1 representing the fraction of the distance remaining after one second.</param>
    /// <param name="deltaTime">The time since the last frame (e.g., Time.deltaTime).</param>
    public static Vector3 LerpFrim(this Vector3 source, Vector3 target, float smoothing, float deltaTime)
    {
        return Vector3.Lerp(source, target, 1f - Mathf.Pow(smoothing, deltaTime));
    }

    /// <summary>
    /// Smooths a Vector3 towards a target using a decay constant (lambda).
    /// </summary>
    /// <param name="source">The starting value.</param>
    /// <param name="target">The target value.</param>
    /// <param name="lambda">A decay constant. Higher values are faster.</param>
    /// <param name="deltaTime">The time since the last frame (e.g., Time.deltaTime).</param>
    public static Vector3 LerpFrimLambda(this Vector3 source, Vector3 target, float lambda, float deltaTime)
    {
        return Vector3.Lerp(source, target, 1f - Mathf.Exp(-lambda * deltaTime));
    }

    #endregion
}
